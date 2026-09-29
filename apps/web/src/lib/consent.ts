import { z } from 'zod';
import { createStorageStore } from './store';

/**
 * First-use consent (PR-2). Recorded on this device before the first question.
 *
 * TODO(B7, PR-2): record consent server-side (version + timestamp against the
 * pseudonymous student id) when the persistence slice lands; the API must refuse
 * to store questions without it. Until then this is a client-side gate only.
 */
export const CONSENT_KEY = 'cm.consent';
/** Bump when the consent text below changes materially; users re-consent. */
export const CONSENT_VERSION = 1;
export const RETENTION_DAYS = 90;

const consentRecordSchema = z.object({
  version: z.number().int().positive(),
  acceptedAt: z.string().datetime(),
});
export type ConsentRecord = z.infer<typeof consentRecordSchema>;

function parseRecord(raw: string | null): ConsentRecord | null {
  if (raw === null) return null;
  try {
    const parsed = consentRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const consentStore = createStorageStore<ConsentRecord | null>({
  area: 'local',
  key: CONSENT_KEY,
  parse: parseRecord,
  serialize: (record) => (record === null ? null : JSON.stringify(record)),
});

export function hasCurrentConsent(record: ConsentRecord | null): record is ConsentRecord {
  return record !== null && record.version >= CONSENT_VERSION;
}

export function recordConsent(now: Date = new Date()): ConsentRecord {
  const record: ConsentRecord = { version: CONSENT_VERSION, acceptedAt: now.toISOString() };
  consentStore.set(record);
  return record;
}
