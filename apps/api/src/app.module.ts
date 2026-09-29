import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { CoursesModule } from './courses/courses.module.js';

/**
 * Root module for the CourseMind API (SDD §4.2). Wires the global Config and
 * Database modules plus the Health and Courses feature modules (M2 Task D).
 */
@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule, CoursesModule],
})
export class AppModule {}
