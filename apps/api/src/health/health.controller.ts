import { Controller, Get } from '@nestjs/common';

/** Liveness probe (M2 Task D1). Mirrors the Python service's `/health` shape. */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }
}
