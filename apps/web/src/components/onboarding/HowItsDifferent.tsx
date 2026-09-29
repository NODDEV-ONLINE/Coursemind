import type { ReactNode } from 'react';
import { BookIcon, HonestIcon, LinkIcon } from '@/components/ui/icons';

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-surface">
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-body font-semibold">{title}</span>
        <span className="text-sm leading-snug text-text-muted">{children}</span>
      </span>
    </li>
  );
}

/** "It's different from a chatbot" — grounded, cited, honest (Main comp). */
export function HowItsDifferent() {
  return (
    <ul className="flex flex-col gap-3.5">
      <Point icon={<BookIcon size={18} className="text-accent-300" />} title="Grounded">
        Answers come only from the materials your lecturer uploaded.
      </Point>
      <Point icon={<LinkIcon size={18} className="text-accent-300" />} title="Cited">
        Every claim links to the exact page or slide it came from.
      </Point>
      <Point icon={<HonestIcon size={18} className="text-refused" />} title="Honest">
        If it isn&apos;t in your course, it tells you, instead of guessing.
      </Point>
    </ul>
  );
}
