import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-5">
      <h1 className="font-display text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-body text-text-muted">
        If you followed a course link, check it with your lecturer.
      </p>
      <Link href="/" className="inline-flex min-h-11 items-center">
        Enter a course link
      </Link>
    </main>
  );
}
