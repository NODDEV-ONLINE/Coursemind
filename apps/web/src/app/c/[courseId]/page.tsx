import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChatApp } from '@/features/chat/ChatApp';
import { courseIdSchema } from '@/lib/course-link';

export const metadata: Metadata = {
  title: 'Course chat · CourseMind',
  // Course links are shared privately; keep them out of search indexes.
  robots: { index: false, follow: false },
};

/** Student chat for one course, selected by link (SR-2: the API scopes every query). */
export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const parsed = courseIdSchema.safeParse(courseId);
  if (!parsed.success) notFound();

  return <ChatApp courseId={parsed.data.toLowerCase()} />;
}
