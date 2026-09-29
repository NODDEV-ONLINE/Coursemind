import type { Turn } from '@/lib/chat-state';
import { resolveAnswer } from '@/lib/citations';
import { completedSentences } from '@/lib/sentences';

/**
 * What the polite live region should contain for the latest turn (NFR-9). The
 * list only grows while a turn progresses, so each item is announced once.
 * Errors, connection loss and rate limits announce themselves via role=alert /
 * role=status on their own cards and are not repeated here.
 */
export function liveAnnouncements(turn: Turn | undefined): string[] {
  if (!turn) return [];
  const items = ['Searching your course materials.'];
  if (turn.status === 'searching') return items;

  const finished = turn.status !== 'streaming';
  const resolved = resolveAnswer(turn.text, finished ? (turn.citations ?? []) : turn.citations);

  if (turn.status === 'refused') {
    return [
      ...items,
      'Not in your course materials.',
      ...completedSentences(resolved.plainText, true),
    ];
  }

  const sentences = completedSentences(
    resolved.plainText,
    turn.status === 'done' || turn.status === 'stopped',
  );
  items.push(...sentences);

  if (turn.status === 'done') {
    const n = resolved.groups.length;
    items.push(
      n === 0
        ? 'Answer complete.'
        : `Answer complete. ${n} ${n === 1 ? 'source document' : 'source documents'}.`,
    );
  } else if (turn.status === 'stopped') {
    items.push('Stopped.');
  }
  return items;
}
