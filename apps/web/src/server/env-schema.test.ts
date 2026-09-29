import { describe, expect, it } from 'vitest';
import { parseServerEnv } from './env-schema';

const OWNER = '11111111-2222-4333-8444-555555555555';

describe('parseServerEnv', () => {
  it('accepts a valid config', () => {
    expect(parseServerEnv({ API_URL: 'http://localhost:3000', DEMO_USER_ID: OWNER })).toEqual({
      API_URL: 'http://localhost:3000',
      DEMO_USER_ID: OWNER,
    });
  });

  it('fails fast listing every bad key', () => {
    expect(() => parseServerEnv({})).toThrowError(/API_URL[\s\S]*DEMO_USER_ID/);
  });

  it('never echoes the offending values', () => {
    const secretish = 'leaky-value-123';
    try {
      parseServerEnv({ API_URL: 'http://localhost:3000', DEMO_USER_ID: secretish });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).toContain('DEMO_USER_ID');
      expect(String(err)).not.toContain(secretish);
    }
  });

  it('ignores a NEXT_PUBLIC_ lookalike (identity must stay server-only)', () => {
    expect(() =>
      parseServerEnv({ API_URL: 'http://localhost:3000', NEXT_PUBLIC_DEMO_USER_ID: OWNER }),
    ).toThrowError(/DEMO_USER_ID/);
  });
});
