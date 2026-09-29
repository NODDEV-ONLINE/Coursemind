import { Module } from '@nestjs/common';
import { CoursesService } from '../courses/courses.service.js';
import { LlmService } from '../llm/llm.service.js';
import { AskController } from './ask.controller.js';
import { AskService } from './ask.service.js';

/**
 * B1–B6 — grounded answering + SSE streaming (M3 Task B, Slice 1).
 *
 * Wires the ask endpoint, the grounded-answer orchestration, and the LLM provider
 * factory. Reuses {@link CoursesService} for the SR-2 ownership check. Config +
 * Database are global modules, so they need no re-import here.
 */
@Module({
  controllers: [AskController],
  providers: [AskService, LlmService, CoursesService],
})
export class AskModule {}
