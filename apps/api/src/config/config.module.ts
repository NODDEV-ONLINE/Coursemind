import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';

/**
 * Global config module: makes the typed {@link ConfigService} injectable
 * everywhere without re-importing. Everything reads env through this provider,
 * never `process.env` directly (CLAUDE.md §4).
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
