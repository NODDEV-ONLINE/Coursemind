'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { parseCourseInput } from '@/lib/course-link';
import { ArrowRightIcon } from '@/components/ui/icons';

/** Fallback course entry: paste the shared course link (or its id). */
export function CourseLinkForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const result = parseCourseInput(value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        router.push(`/c/${result.courseId}`);
      }}
    >
      <label htmlFor={inputId} className="text-meta font-semibold">
        Your course link
      </label>
      <p id={hintId} className="text-meta text-text-muted">
        Open the link your lecturer shared, or paste it here.
      </p>
      <input
        id={inputId}
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://…/c/…"
        aria-invalid={error !== null}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        className="h-12 rounded-xl border-[1.5px] border-border bg-surface px-3.5 text-base text-text focus:border-accent-500 aria-invalid:border-error"
      />
      {error && (
        <p id={errorId} role="alert" className="text-meta text-error-text">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="mt-2 flex h-13 items-center justify-center gap-2 rounded-card bg-accent-500 text-base font-semibold text-on-accent hover:bg-accent-600"
      >
        Open course
        <ArrowRightIcon size={18} />
      </button>
    </form>
  );
}
