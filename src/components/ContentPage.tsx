import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "./JsonLd";
import { SiteFooter } from "./SiteFooter";
import { AccountMenu } from "./account/AccountMenu";
import { articleLd, breadcrumbLd, faqLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

export interface Faq {
  q: string;
  a: string;
}

interface Props {
  title: string;
  description: string;
  path: string;
  crumb: string;
  published: string;
  modified: string;
  children: ReactNode;
  faq?: Faq[];
  related?: { href: string; title: string; text: string }[];
}

/**
 * A server-rendered article page: one h1, breadcrumb, structured data, an honest call to action and links onward.
 * Plain HTML first, so it is fast and fully readable by crawlers and by people on slow connections.
 */
export function ContentPage({ title, description, path, crumb, published, modified, children, faq, related }: Props) {
  const crumbs = [{ name: "Home", path: "/" }, { name: crumb, path }];
  return (
    <>
      <JsonLd data={[articleLd({ title, description, path, published, modified }), breadcrumbLd(crumbs), ...(faq?.length ? [faqLd(faq)] : [])]} />
      <main id="main" className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-display text-xl">
            {SITE_NAME}
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-sm">
            <Link href="/ats-resume-templates" prefetch={false} className="hidden min-h-10 items-center rounded-lg px-3 text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
              Templates
            </Link>
            <Link href="/quick" prefetch={false} className="inline-flex min-h-10 items-center rounded-lg px-3 font-medium text-accent hover:bg-accent-soft">
              Quick resume
            </Link>
            <AccountMenu />
          </nav>
        </header>

        <nav aria-label="Breadcrumb" className="text-sm text-ink-2">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-ink hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page">{crumb}</li>
          </ol>
        </nav>

        <article className="mt-4">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-ink-2">
            Updated <time dateTime={modified}>{new Date(modified).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time>
          </p>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">{description}</p>
          <div className="content mt-8 space-y-10 leading-relaxed [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:sm:text-3xl [&_h3]:mt-5 [&_h3]:font-medium [&_li]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
            {children}
          </div>

          {faq && faq.length > 0 && (
            <section className="mt-12" aria-labelledby="faq-h">
              <h2 id="faq-h" className="mb-3 font-display text-2xl sm:text-3xl">
                Frequently asked questions
              </h2>
              <dl className="space-y-5">
                {faq.map((f) => (
                  <div key={f.q}>
                    <dt className="font-medium">{f.q}</dt>
                    <dd className="mt-1 text-ink-2">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </article>

        <aside className="mt-12 rounded-2xl border border-line bg-surface p-5 sm:p-7" aria-labelledby="cta-h">
          <h2 id="cta-h" className="font-display text-2xl">
            Put it into practice, free
          </h2>
          <p className="mt-2 text-ink-2">Paste a job description, add your details once and get an ATS-friendly resume in about a minute. No sign-up needed, and the AI never invents a skill you did not tell it about.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/quick" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-ink shadow-sm hover:brightness-110">
              Make my resume
            </Link>
            <Link href="/ats-resume-templates" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-5 text-sm font-medium hover:bg-surface-2">
              Browse the templates
            </Link>
          </div>
        </aside>

        {related && related.length > 0 && (
          <nav aria-labelledby="rel-h" className="mt-10">
            <h2 id="rel-h" className="font-display text-xl">
              Keep reading
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="block h-full rounded-xl border border-line bg-surface p-4 hover:border-accent">
                    <span className="font-medium">{r.title}</span>
                    <span className="mt-1 block text-sm text-ink-2">{r.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
