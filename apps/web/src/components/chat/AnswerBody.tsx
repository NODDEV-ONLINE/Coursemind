import type { RenderSegment } from '@/lib/citations';
import { CitationChip } from './CitationChip';

export interface AnswerBodyProps {
  segments: readonly RenderSegment[];
  streaming: boolean;
  dimmed?: boolean;
  activeKey: string | null;
  onOpenSource: (key: string) => void;
}

/**
 * Answer text with inline citation chips. Text is rendered as React text nodes
 * only (never HTML). `pre-line` keeps the model's line breaks while collapsing the
 * double spaces left where an invalid citation was dropped.
 */
export function AnswerBody({
  segments,
  streaming,
  dimmed = false,
  activeKey,
  onOpenSource,
}: AnswerBodyProps) {
  return (
    <div
      className={`text-body break-words whitespace-pre-line ${dimmed ? 'text-text-muted' : 'text-text'}`}
    >
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <CitationChip
            key={i}
            sourceNumber={seg.sourceNumber}
            page={seg.page}
            verified={seg.chunkId !== null}
            active={activeKey === seg.key}
            onOpen={() => onOpenSource(seg.key)}
          />
        ),
      )}
      {streaming && (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[1.1em] w-2 translate-y-[0.2em] rounded-[1px] bg-accent-400 motion-safe:animate-caret"
        />
      )}
    </div>
  );
}
