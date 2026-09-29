'use client';

import { useSyncExternalStore } from 'react';
import { ConsentScreen } from '@/components/onboarding/ConsentScreen';
import {
  consentStore,
  hasCurrentConsent,
  recordConsent,
  RETENTION_DAYS,
  type ConsentRecord,
} from '@/lib/consent';
import { lowDataStore } from '@/lib/preferences';
import { pseudonymStore } from '@/lib/pseudonym';
import { ChatScreen } from './ChatScreen';

const serverUnknown = (): undefined => undefined;

/**
 * Course route entry: consent gate (C7, PR-2) → chat. Device-local state is read
 * after hydration (server snapshot = unknown), so SSR and first client render match.
 */
export function ChatApp({ courseId }: { courseId: string }) {
  const consent = useSyncExternalStore<ConsentRecord | null | undefined>(
    consentStore.subscribe,
    consentStore.get,
    serverUnknown,
  );
  const pseudonym = useSyncExternalStore<string | undefined>(
    pseudonymStore.subscribe,
    pseudonymStore.get,
    serverUnknown,
  );
  const lowData = useSyncExternalStore(lowDataStore.subscribe, lowDataStore.get, () => true);

  if (consent === undefined || pseudonym === undefined) {
    return <div className="min-h-dvh bg-bg" aria-busy="true" />;
  }

  if (!hasCurrentConsent(consent)) {
    return (
      <ConsentScreen
        pseudonym={pseudonym}
        retentionDays={RETENTION_DAYS}
        lowData={lowData}
        onAccept={() => recordConsent()}
      />
    );
  }

  return (
    <ChatScreen courseId={courseId} lowData={lowData} pseudonym={pseudonym} consent={consent} />
  );
}
