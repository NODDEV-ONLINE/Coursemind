import { memo } from 'react';

export interface UserMessageProps {
  question: string;
  time: string;
}

/** The student's question, echoed immediately on send. */
export const UserMessage = memo(function UserMessage({ question, time }: UserMessageProps) {
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1 self-end">
      <h2 className="sr-only">You asked</h2>
      <p className="rounded-2xl rounded-br-sm bg-surface-raised px-3.5 py-2.5 text-body leading-normal break-words whitespace-pre-line">
        {question}
      </p>
      <span className="text-2xs text-text-muted">{time}</span>
    </div>
  );
});
