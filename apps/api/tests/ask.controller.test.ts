import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AskController } from '../src/ask/ask.controller.js';
import type { AskService } from '../src/ask/ask.service.js';
import type { CoursesService } from '../src/courses/courses.service.js';
import type { AskEvent } from '../src/ask/ask.events.js';

/**
 * E4 at the HTTP boundary: the controller adapts the {@link AskService} event
 * generator into a real SSE response. Verifies SSE headers, frame format, and that
 * ownership (SR-2) is checked before streaming. AskService is faked — no LLM/DB.
 */

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const COURSE_ID = '22222222-2222-2222-2222-222222222222';
const DOC_ID = '44444444-4444-4444-4444-444444444444';

/** A fake Express response that records headers and written SSE frames. */
class FakeResponse {
  headers: Record<string, string> = {};
  body = '';
  writableEnded = false;
  setHeader(k: string, v: string): void {
    this.headers[k.toLowerCase()] = v;
  }
  flushHeaders(): void {}
  write(chunk: string): boolean {
    this.body += chunk;
    return true;
  }
  end(): void {
    this.writableEnded = true;
  }
}

function makeRequest(): Request {
  // Only `.on('close', ...)` is used by the controller.
  return new EventEmitter() as unknown as Request;
}

describe('AskController — SSE wiring (E4, SR-2)', () => {
  let controller: AskController;
  let courses: { assertOwnership: ReturnType<typeof vi.fn> };
  let ask: { streamAnswer: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    courses = { assertOwnership: vi.fn().mockResolvedValue(undefined) };
    ask = { streamAnswer: vi.fn() };
    controller = new AskController(
      courses as unknown as CoursesService,
      ask as unknown as AskService,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('checks ownership, sets SSE headers, and writes framed events in order', async () => {
    const events: AskEvent[] = [
      { event: 'token', data: { delta: 'Hello ' } },
      { event: 'token', data: { delta: 'world' } },
      { event: 'citations', data: { citations: [{ document_id: DOC_ID, page: 1, chunk_id: 'c1' }] } },
      { event: 'done', data: { finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 2 } } },
    ];
    ask.streamAnswer.mockImplementation(async function* () {
      for (const e of events) yield e;
    });

    const res = new FakeResponse();
    await controller.ask_(
      OWNER_ID,
      undefined,
      undefined,
      COURSE_ID,
      { question: 'hi' },
      makeRequest(),
      res as unknown as Response,
    );

    // SR-2: ownership verified before streaming.
    expect(courses.assertOwnership).toHaveBeenCalledWith(COURSE_ID, OWNER_ID);

    // SSE content type + no-buffering headers.
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['x-accel-buffering']).toBe('no');

    // Frames appear in order, each a valid SSE frame.
    expect(res.body).toBe(
      'event: token\ndata: {"delta":"Hello "}\n\n' +
        'event: token\ndata: {"delta":"world"}\n\n' +
        `event: citations\ndata: {"citations":[{"document_id":"${DOC_ID}","page":1,"chunk_id":"c1"}]}\n\n` +
        'event: done\ndata: {"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":2}}\n\n',
    );
    expect(res.writableEnded).toBe(true);
  });

  it('passes low-data mode through from the query flag', async () => {
    ask.streamAnswer.mockImplementation(async function* () {
      yield { event: 'done', data: { finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } } } as AskEvent;
    });
    const res = new FakeResponse();

    await controller.ask_(
      OWNER_ID,
      undefined,
      '1', // ?lowData=1
      COURSE_ID,
      { question: 'hi' },
      makeRequest(),
      res as unknown as Response,
    );

    expect(ask.streamAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: COURSE_ID, question: 'hi', lowData: true }),
    );
  });
});
