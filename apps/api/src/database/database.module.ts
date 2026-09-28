import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

/**
 * Global database module exposing the shared `pg.Pool` wrapper. Global so any
 * feature module can inject {@link DatabaseService} without re-importing.
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
