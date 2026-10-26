import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "./JsonLd";
import { SiteFooter } from "./SiteFooter";
import { breadcrumbLd } from "@/lib/seo";
import { CONTACT_EMAIL, LEGAL_UPDATED, SITE_NAME } from "@/lib/site";

/** A readable single-column page for legal text: server-rendered, no JavaScript needed. */
export function LegalPage({ title, intro, path, children }: { title: string; intro: string; path: string; children: ReactNode }) {
  return (
    <>
    <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: title, path }])} />
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="font-display text-xl">
          {SITE_NAME}
        </Link>
        <nav aria-label="Legal" className="flex gap-1 text-sm">
          <Link href="/privacy" className="inline-flex min-h-10 items-center rounded-lg px-3 text-ink-2 hover:bg-surface-2 hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center rounded-lg px-3 text-ink-2 hover:bg-surface-2 hover:text-ink">
            Terms
          </Link>
        </nav>
      </header>
      <h1 className="font-display text-4xl leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink-2">Last updated {LEGAL_UPDATED}</p>
      <p className="mt-5 text-lg leading-relaxed text-ink-2">{intro}</p>
      <div className="legal mt-8 space-y-8 leading-relaxed [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-2xl [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">{children}</div>
      {CONTACT_EMAIL && (
        <section className="mt-10 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-2xl">Questions or requests</h2>
          <p className="mt-2 text-ink-2">
            Write to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      )}
    </main>
    <SiteFooter />
    </>
  );
}
