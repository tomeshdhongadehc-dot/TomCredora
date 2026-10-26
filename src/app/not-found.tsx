import type { Metadata } from "next";
import Link from "next/link";
import { noIndexMeta } from "@/lib/seo";

export const metadata: Metadata = noIndexMeta("Page not found");

/** A real "not found" page (HTTP 404, never indexed) that sends people somewhere useful instead of a dead end. */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-5 py-16">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 font-display text-4xl">That page does not exist</h1>
      <p className="mt-3 text-ink-2">The link may be old or mistyped. These are good places to start:</p>
      <ul className="mt-5 space-y-1">
        <li>
          <Link href="/quick" className="inline-flex min-h-10 items-center text-accent underline underline-offset-4">
            Make a tailored resume in about a minute
          </Link>
        </li>
        <li>
          <Link href="/ats-resume-templates" className="inline-flex min-h-10 items-center text-accent underline underline-offset-4">
            Browse the ATS resume templates
          </Link>
        </li>
        <li>
          <Link href="/" className="inline-flex min-h-10 items-center text-accent underline underline-offset-4">
            Go to the home page
          </Link>
        </li>
      </ul>
    </main>
  );
}
