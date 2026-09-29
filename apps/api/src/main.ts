import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@coursemind/config';
import { AppModule } from './app.module.js';

/**
 * CourseMind API bootstrap (M2 Task D1, SDD §4.2).
 *
 * We call loadEnv() *before* creating the app so a missing/invalid environment
 * fails fast at startup (CLAUDE.md §4) rather than on the first request.
 */
async function bootstrap(): Promise<void> {
  loadEnv();

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // ensures DatabaseService.onModuleDestroy runs

  // PORT is a process-level concern (not in the shared config schema); default 3000.
  const port = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
  await app.listen(port);
}

void bootstrap();
