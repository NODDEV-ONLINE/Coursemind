import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CoursesService } from '../courses/courses.service.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { AskService } from './ask.service.js';
import { serializeSseEvent } from './ask.events.js';
import {
  askQuestionSchema,
  userIdHeaderSchema,
  uuidParamSchema,
  type AskQuestionInput,
} from './ask.schema.js';

/**
 * B3/B5/B6 — `POST /courses/:id/ask` (FR-8, FR-13).
 *
 * Validates the course id (UUID) and body (`{ question }`) with Zod, verifies course
 * ownership via the `X-User-Id` header (M2 auth placeholder, SR-2), then streams a
 * grounded, cited answer — or a refusal — as Server-Sent Events. See
 * {@link ask.events.ts} for the full SSE event contract (Task C depends on it).
 *
 * Low-data mode (B6, FR-14/NFR-2): `?lowData=1` or `X-Low-Data: 1` returns a compact
 * text answer under the 30 KB budget (same SSE contract, no heavy assets).
 */
@Controller('courses')
export class AskController {
  constructor(
    private readonly courses: CoursesService,
    private readonly ask: AskService,
  ) {}

  private requireUserId(header: string | undefined): string {
    const parsed = userIdHeaderSchema.safeParse(header);
    if (!parsed.success) {
      throw new UnauthorizedException('Missing or invalid X-User-Id header');
    }
    return parsed.data;
  }

  @Post(':id/ask')
  async ask_(
    @Headers('x-user-id') userIdHeader: string | undefined,
    @Headers('x-low-data') lowDataHeader: string | undefined,
    @Query('lowData') lowDataQuery: string | undefined,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) courseId: string,
    @Body(new ZodValidationPipe(askQuestionSchema)) body: AskQuestionInput,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ownerId = this.requireUserId(userIdHeader);
    // SR-2: verify course ownership before any retrieval or LLM call.
    await this.courses.assertOwnership(courseId, ownerId);

    const lowData = lowDataQuery === '1' || lowDataHeader === '1';

    // SSE headers. `X-Accel-Buffering: no` disables proxy buffering so tokens
    // reach the client incrementally (TTFT budget, NFR-1).
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Cancellation: abort retrieval + LLM when the client disconnects.
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      for await (const evt of this.ask.streamAnswer({
        courseId,
        question: body.question,
        lowData,
        signal: controller.signal,
      })) {
        if (controller.signal.aborted) break;
        res.write(serializeSseEvent(evt));
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }
}
