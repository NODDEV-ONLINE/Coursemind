import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { IngestClientService } from '../ingest/ingest-client.service.js';

/**
 * Courses feature module (M2 Task D): create courses, upload documents (→ queued
 * + ingest hand-off), and read per-document status. Depends on the global Config
 * and Database modules.
 */
@Module({
  controllers: [CoursesController],
  providers: [CoursesService, IngestClientService],
})
export class CoursesModule {}
