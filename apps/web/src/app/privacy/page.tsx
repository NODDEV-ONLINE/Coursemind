import type { Metadata } from 'next';
import Link from 'next/link';
import { RETENTION_DAYS } from '@/lib/consent';

export const metadata: Metadata = { title: 'Privacy · CourseMind' };

/**
 * Privacy summary. TODO(PR-7): replace with the full, reviewed privacy notice
 * (processors, cross-border transfers, lawful basis, contact) before the pilot.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-5 py-6 text-body">
      <h1 className="font-display text-2xl font-semibold">Privacy at a glance</h1>
      <p className="text-text-muted">
        The full privacy notice is being finalised. Here is what applies today.
      </p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>You use CourseMind under a random ID like anon-7F3K. We never ask for your name.</li>
        <li>
          Your questions, the answers and your ratings are kept for {RETENTION_DAYS} days to check
          answer quality, then deleted.
        </li>
        <li>
          Answers are written by Anthropic&apos;s models. Searching your course materials uses
          Google&apos;s embedding service. Both may process data outside your country.
        </li>
        <li>Your low-data setting, consent record and ID are stored on this device only.</li>
      </ul>
      <Link href="/" className="inline-flex min-h-11 items-center">
        Back to CourseMind
      </Link>
    </main>
  );
}
