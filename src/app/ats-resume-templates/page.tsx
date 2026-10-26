import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { ResumePaper } from "@/components/ResumePaper";
import { SiteFooter } from "@/components/SiteFooter";
import { AccountMenu } from "@/components/account/AccountMenu";
import { breadcrumbLd, pageMeta } from "@/lib/seo";
import { SAMPLE_RESUME } from "@/lib/sample";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { PRESETS } from "@/lib/templates";
import { PAPER_CSS } from "@/lib/paper-css";

const TITLE = "ATS Resume Templates: 23 Free, Parser-Safe Designs";
const DESCRIPTION = `${PRESETS.length} free ATS-friendly resume templates: one column of real text, standard headings, no tables or icons. Pick one, then tailor it to a job.`;

export const metadata = pageMeta({ title: TITLE, description: DESCRIPTION, path: "/ats-resume-templates" });

export default function TemplatesPage() {
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "ATS resume templates",
    itemListElement: PRESETS.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: `${p.name} resume template`, url: `${SITE_URL}/build?template=${p.id}` })),
  };
  return (
    <>
      <style>{PAPER_CSS}</style>
      <JsonLd data={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "ATS resume templates", path: "/ats-resume-templates" }]), list]} />
      <main id="main" className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-display text-xl">
            {SITE_NAME}
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-sm">
            <Link href="/guides/ats-friendly-resume" prefetch={false} className="hidden min-h-10 items-center rounded-lg px-3 text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
              ATS checklist
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
            <li aria-current="page">ATS resume templates</li>
          </ol>
        </nav>

        <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight sm:text-5xl">{TITLE}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{DESCRIPTION}</p>

        <section className="mt-8 max-w-3xl space-y-3 leading-relaxed" aria-labelledby="why-h">
          <h2 id="why-h" className="font-display text-2xl">
            What makes a template ATS-friendly
          </h2>
          <p>
            An applicant tracking system reads your resume as a stream of text, top to bottom. Anything that breaks that stream, such as columns, tables, text boxes, icons, images, or contact details tucked into a page header, can
            scramble the order or hide information. Every template below avoids all of that: one column, real text, standard section names (Summary, Skills, Experience, Education), and common fonts. Read the{" "}
            <Link href="/guides/ats-friendly-resume" className="text-accent underline underline-offset-4">
              ATS-friendly resume checklist
            </Link>{" "}
            for the full list of rules.
          </p>
          <p>Each template shows your real structure, so you can compare them with sample data here and then open any of them with your own details. You can change the font, size, spacing, colours, section order and more afterwards.</p>
        </section>

        <ul className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Templates">
          {PRESETS.map((p) => (
            <li key={p.id} className="flex flex-col rounded-2xl border border-line bg-surface p-3 [contain-intrinsic-size:auto_520px] [content-visibility:auto]">
              <Link href={`/build?template=${p.id}`} className="pointer-events-auto block" aria-label={`Use the ${p.name} template`}>
                <div className="pointer-events-none aspect-[4/3] overflow-hidden rounded-lg border border-line">
                  <ResumePaper resume={SAMPLE_RESUME} config={p.config} showGuide={false} decorative />
                </div>
              </Link>
              <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
                <h2 className="font-display text-xl">{p.name} resume template</h2>
                <p className="mt-1 text-xs text-ink-2">{p.tags.join(" · ")}</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{p.blurb}</p>
                <Link href={`/build?template=${p.id}`} className="mt-3 inline-flex min-h-10 items-center self-start text-sm font-medium text-accent underline-offset-4 hover:underline">
                  Use the {p.name} template
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter wide />
    </>
  );
}
