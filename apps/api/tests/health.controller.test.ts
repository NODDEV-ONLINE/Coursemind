import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health/health.controller.js';

describe('HealthController', () => {
  it('returns the liveness payload', () => {
    const controller = new HealthController();
    expect(controller.check()).toEqual({ status: 'ok', service: 'api' });
  });
});
