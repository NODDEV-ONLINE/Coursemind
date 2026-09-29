import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { AskModule } from './ask/ask.module.js';

/**
 * Root module for the CourseMind API (SDD §4.2). Wires the global Config and
 * Database modules plus the Health, Courses (M2 Task D) and Ask (M3 Task B —
 * grounded answering + SSE streaming) feature modules.
 */
@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule, CoursesModule, AskModule],
})
export class AppModule {}
