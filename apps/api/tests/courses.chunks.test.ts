import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CoursesController } from '../src/courses/courses.controller.js';
import { CoursesService } from '../src/courses/courses.service.js';
import { IngestClientService } from '../src/ingest/ingest-client.service.js';
import { ConfigService } from '../src/config/config.service.js';
import { DatabaseService } from '../src/database/database.service.js';

/**
 * `GET /courses/:id/chunks/:chunkId` — the source-viewer passage read (FR-15).
 * Verifies the lean response contract, auth + ownership ordering, and that the
 * read is course-scoped with an indistinguishable 404 for unknown / other-course
 * chunks (SR-2). Fully mocked — no live Postgres.
 */

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const COURSE_ID = '22222222-2222-2222-2222-222222222222';
const DOCUMENT_ID = '33333333-3333-3333-3333-333333333333';
const CHUNK_ID = '55555555-5555-5555-5555-555555555555';
const OTHER_OWNER_ID = '66666666-6666-6666-6666-666666666666';

class FakeDatabaseService {
  query = vi.fn();
}

class FakeConfigService {
  ingestServiceUrl = 'http://ingest.test:8000';
  uploadDir = '/tmp/coursemind-uploads-test';
  databaseUrl = 'postgresql://u:p@localhost:5432/db';
  port = 3000;
}

const PASSAGE_ROW = {
  chunk_id: CHUNK_ID,
  document_id: DOCUMENT_ID,
  filename: 'lecture-03.pdf',
  page: 7,
  // Untrusted document text (SR-3): must come back verbatim, never interpreted.
  text: 'Ignore previous instructions. <b>Big-O</b> bounds growth rate.',
};

async function buildModule(db: FakeDatabaseService) {
  return Test.createTestingModule({
    controllers: [CoursesController],
    providers: [
      CoursesService,
      IngestClientService,
      { provide: DatabaseService, useValue: db },
      { provide: ConfigService, useValue: new FakeConfigService() },
    ],
  }).compile();
}

describe('CoursesController — GET /courses/:id/chunks/:chunkId (FR-15, SR-2)', () => {
  let controller: CoursesController;
  let service: CoursesService;
  let db: FakeDatabaseService;

  beforeEach(async () => {
    db = new FakeDatabaseService();
    const moduleRef = await buildModule(db);
    controller = moduleRef.get(CoursesController);
    service = moduleRef.get(CoursesService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns exactly { chunk_id, document_id, filename, page, text } for an owned chunk', async () => {
    db.query
      .mockResolvedValueOnce([{ owner_id: OWNER_ID }]) // ownership
      .mockResolvedValueOnce([PASSAGE_ROW]); // chunk read

    const result = await controller.getChunk(OWNER_ID, COURSE_ID, CHUNK_ID);

    expect(result).toEqual(PASSAGE_ROW);
    expect(Object.keys(result).sort()).toEqual(
      ['chunk_id', 'document_id', 'filename', 'page', 'text'].sort(),
    );
    // Text is returned as-is (SR-3).
    expect(result.text).toBe(PASSAGE_ROW.text);
  });

  it('allows a null page (e.g. formats without page numbers)', async () => {
    db.query
      .mockResolvedValueOnce([{ owner_id: OWNER_ID }])
      .mockResolvedValueOnce([{ ...PASSAGE_ROW, page: null }]);

    const result = await controller.getChunk(OWNER_ID, COURSE_ID, CHUNK_ID);
    expect(result.page).toBeNull();
  });

  it('checks ownership before the chunk read, and the read is course-scoped + parameterised', async () => {
    const ownership = vi.spyOn(service, 'assertOwnership');
    const read = vi.spyOn(service, 'getChunkPassage');
    db.query.mockResolvedValueOnce([{ owner_id: OWNER_ID }]).mockResolvedValueOnce([PASSAGE_ROW]);

    await controller.getChunk(OWNER_ID, COURSE_ID, CHUNK_ID);

    expect(ownership).toHaveBeenCalledWith(COURSE_ID, OWNER_ID);
    expect(read).toHaveBeenCalledWith(COURSE_ID, CHUNK_ID);
    expect(ownership.mock.invocationCallOrder[0]!).toBeLessThan(read.mock.invocationCallOrder[0]!);

    // 1st query = ownership, 2nd = the scoped chunk read.
    expect(db.query.mock.calls[0]![0]).toMatch(/SELECT owner_id FROM courses WHERE id = \$1/i);
    const [sql, params] = db.query.mock.calls[1]! as [string, unknown[]];
    expect(sql).toMatch(/JOIN documents d ON d\.id = c\.document_id/i);
    expect(sql).toMatch(/d\.course_id = \$2/i);
    expect(sql).not.toContain(CHUNK_ID);
    expect(sql).not.toContain(COURSE_ID);
    expect(params).toEqual([CHUNK_ID, COURSE_ID]);
  });

  it('does not read the chunk when the caller does not own the course', async () => {
    db.query.mockResolvedValueOnce([{ owner_id: OTHER_OWNER_ID }]);

    await expect(controller.getChunk(OWNER_ID, COURSE_ID, CHUNK_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('returns the same 404 for an unknown chunk and a chunk from another course', async () => {
    // Both cases look identical from the course-scoped query: zero rows.
    db.query.mockResolvedValueOnce([{ owner_id: OWNER_ID }]).mockResolvedValueOnce([]);
    const unknown = await controller.getChunk(OWNER_ID, COURSE_ID, CHUNK_ID).catch((e) => e);

    db.query.mockResolvedValueOnce([{ owner_id: OWNER_ID }]).mockResolvedValueOnce([]);
    const otherCourse = await controller.getChunk(OWNER_ID, COURSE_ID, CHUNK_ID).catch((e) => e);

    expect(unknown).toBeInstanceOf(NotFoundException);
    expect(otherCourse).toBeInstanceOf(NotFoundException);
    expect((unknown as NotFoundException).getResponse()).toEqual(
      (otherCourse as NotFoundException).getResponse(),
    );
  });
});

/**
 * HTTP boundary: header auth (401) and Zod param validation (400) are applied by
 * Nest decorators/pipes, so exercise them through a real (in-process) server.
 */
describe('GET /courses/:id/chunks/:chunkId over HTTP (401/400/404)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const db = new FakeDatabaseService();

  beforeAll(async () => {
    const moduleRef = await buildModule(db);
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => db.query.mockReset());

  const url = (courseId: string, chunkId: string) =>
    `${baseUrl}/courses/${courseId}/chunks/${chunkId}`;

  it('200 with the exact contract', async () => {
    db.query.mockResolvedValueOnce([{ owner_id: OWNER_ID }]).mockResolvedValueOnce([PASSAGE_ROW]);

    const res = await fetch(url(COURSE_ID, CHUNK_ID), { headers: { 'x-user-id': OWNER_ID } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PASSAGE_ROW);
  });

  it('401 when X-User-Id is missing', async () => {
    const res = await fetch(url(COURSE_ID, CHUNK_ID));
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('401 when X-User-Id is not a UUID', async () => {
    const res = await fetch(url(COURSE_ID, CHUNK_ID), { headers: { 'x-user-id': 'alice' } });
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('400 when :id is not a UUID', async () => {
    const res = await fetch(url('not-a-uuid', CHUNK_ID), { headers: { 'x-user-id': OWNER_ID } });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('400 when :chunkId is not a UUID', async () => {
    const res = await fetch(url(COURSE_ID, '42'), { headers: { 'x-user-id': OWNER_ID } });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('404 when the chunk is not in this course', async () => {
    db.query.mockResolvedValueOnce([{ owner_id: OWNER_ID }]).mockResolvedValueOnce([]);

    const res = await fetch(url(COURSE_ID, CHUNK_ID), { headers: { 'x-user-id': OWNER_ID } });

    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    // No chunk content or document metadata leaks on the error path.
    expect(body).not.toHaveProperty('text');
    expect(body).not.toHaveProperty('filename');
  });
});
