import { CourseLinkForm } from '@/components/onboarding/CourseLinkForm';
import { HowItsDifferent } from '@/components/onboarding/HowItsDifferent';
import { LogoMark, Wordmark } from '@/components/ui/Logo';

/**
 * Landing: a short intro plus the fallback course-link field. Students normally
 * arrive on /c/<courseId> straight from the link their lecturer shared.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5.5 px-5 pt-5 pb-6">
      <span className="flex items-center gap-2">
        <LogoMark size={28} />
        <Wordmark className="text-lg" />
      </span>

      <div className="flex flex-col gap-2.5">
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight">
          A tutor that only answers from <span className="text-accent-300">your course.</span>
        </h1>
        <p className="text-body text-text-muted">
          It&apos;s different from a chatbot. Here&apos;s how.
        </p>
      </div>

      <HowItsDifferent />

      <div className="mt-auto">
        <CourseLinkForm />
      </div>
    </main>
  );
}
