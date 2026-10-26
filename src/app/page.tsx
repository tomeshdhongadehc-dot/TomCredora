import Link from "next/link";
import { AccountMenu } from "@/components/account/AccountMenu";
import { JsonLd } from "@/components/JsonLd";
import { ShowMore, ShowMoreItem } from "@/components/ShowMore";
import { SiteFooter } from "@/components/SiteFooter";
import { ResumePaper } from "@/components/ResumePaper";
import { PAPER_CSS } from "@/lib/paper-css";
import { HOME_META, faqLd, webAppLd, websiteLd } from "@/lib/seo";
import { SAMPLE_RESUME } from "@/lib/sample";
import { PRESETS, presetById } from "@/lib/templates";

export const metadata = HOME_META;

const cta =
  "inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3.5 text-sm font-medium text-accent-ink shadow-sm transition duration-[var(--dur)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.98]";

const STEPS = [
  { n: "1", t: "Add your details once", d: "Roles, skills, education. Write them roughly, in your own words. Your name, email, phone and links are never sent to the AI." },
  { n: "2", t: "Paste the job description", d: "We pull out the keywords ATS filters and recruiters scan for, and show you which ones you already cover." },
  { n: "3", t: "Tailor, confirm, export", d: "The AI rewords what you wrote. Anything it adds is flagged for you to confirm. Then download in the format you need." },
];

const NEVER = [
  { t: "invent a number or a skill", d: "Every figure, tool and technology is checked against what you wrote. Made-up ones are removed, not shipped." },
  { t: "slip in claims quietly", d: "New wording the AI adds is shown next to your original, with a one-click way back to your own words." },
  { t: "send your contact details to an AI", d: "Name, email and phone are never sent to the AI. Only your experience, skills and the job text are used to tailor." },
];

/** The six templates shown first: a spread of looks (plain, coloured, serif, banded, dense, academic), not just the first six in the list. */
const FIRST_SIX = 6;
const FEATURED = ["classic", "modern", "horizon", "executive", "slate", "scholar"];
const FEATURED_FIRST = [...FEATURED.map((id) => PRESETS.find((p) => p.id === id)!).filter(Boolean), ...PRESETS.filter((p) => !FEATURED.includes(p.id))];

const FORMATS = ["PDF", "Word (.docx)", "LaTeX / Overleaf", "HTML + CSS", "Plain text"];

const FAQ = [
  { q: "Will this get past an ATS?", a: "Every template is a single column of real text with standard headings: no tables, icons, images or text boxes, which are what trip parsers up. No tool can guarantee a result, so the score is shown as a guide and you can preview exactly what a parser reads." },
  { q: "Is it free?", a: "Yes. Everything works in your browser. The AI uses the free Gemini tier, which has a small daily limit, so you can paste your own free key if you tailor a lot." },
  { q: "Where is my data stored?", a: "Without an account, your data is saved in your own browser only. If you sign in, your profile and resumes are also kept in your account so they follow you to other devices, and you can delete them at any time. Exporting uploads nothing. When you tailor, your experience, skills and the job text go to our server and to the AI (Gemini); your name, email, phone and links never go to the AI." },
  { q: "Can I edit what the AI wrote?", a: "Always. You see your resume update live, and every AI-added claim is listed for you to keep or revert." },
];

export default function Home() {
  return (
    <>
      <style>{PAPER_CSS}</style>
      <JsonLd data={[websiteLd(), webAppLd(), faqLd(FAQ)]} />
      <main id="main" className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <Link href="/" className="font-display text-xl">
            TomCredora
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 whitespace-nowrap text-sm">
            <Link href="/profile" prefetch={false} className="hidden rounded-lg px-2 py-2 font-medium text-accent transition hover:bg-accent-soft min-[360px]:inline-block sm:px-3">
              <span className="hidden sm:inline">My </span>Profile
            </Link>
            <Link href="/quick" prefetch={false} className="hidden rounded-lg px-3 py-2 text-ink-2 transition hover:bg-surface-2 hover:text-ink md:block">
              Quick resume
            </Link>
            <a href="#templates" className="hidden rounded-lg px-3 py-2 text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:block">
              Templates
            </a>
            <Link href="/studio" prefetch={false} className="hidden rounded-lg px-3 py-2 text-ink-2 transition hover:bg-surface-2 hover:text-ink md:block">
              Workspace
            </Link>
            <a href="#honesty" className="hidden rounded-lg px-3 py-2 text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:block">
              Honest AI
            </a>
            <a href="#faq" className="hidden rounded-lg px-3 py-2 text-ink-2 transition hover:bg-surface-2 hover:text-ink lg:block">
              FAQ
            </a>
            <AccountMenu className="!px-2 sm:!px-3" />
            <Link href="/build" prefetch={false} className="ml-1 rounded-lg border border-line bg-surface px-3 py-2 font-medium transition hover:bg-surface-2 sm:ml-2 sm:px-4">
              <span className="sm:hidden">Build</span>
              <span className="hidden sm:inline">Open builder</span>
            </Link>
          </nav>
        </header>

        {/* ---------- Hero ---------- */}
        <section className="grid items-center gap-12 py-12 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div className="rise">
            <p className="mb-5 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">ATS-friendly. Honest. Fast.</p>
            <h1 className="font-display text-4xl leading-[1.04] sm:text-6xl">
              The right resume for every job, <em className="text-accent not-italic">in minutes.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              Paste the job description, add your details once, and get a concise resume with the words recruiters look for, without a single exaggeration.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href="/build" prefetch={false} className={cta}>
                Build my resume
              </Link>
              <Link href="/profile" prefetch={false} className="inline-flex min-h-10 items-center text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                My profile
              </Link>
              {/* no idle prefetch: the page carries the whole editor, and the landing page has a JS budget */}
              <Link href="/quick" prefetch={false} className="inline-flex min-h-10 items-center text-sm font-medium text-accent underline-offset-4 hover:underline">
                Quick resume (under a minute)
              </Link>
              <Link href="/studio" prefetch={false} className="inline-flex min-h-10 items-center text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                Open the workspace
              </Link>
              <a href="#templates" className="inline-flex min-h-10 items-center text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                See the {PRESETS.length} templates
              </a>
            </div>
            <p className="mt-4 text-sm text-ink-2">No sign-up needed. Your details stay in your browser unless you choose to sign in.</p>
          </div>

          {/* Animated demo: keywords in the job post light up, then land in the resume. CSS only, no JavaScript. */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
            <div className="demo-jd rise rounded-2xl border border-line bg-surface p-4 shadow-sm" style={{ animationDelay: "120ms" }}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-2">Job description</p>
              <p className="text-[13px] leading-relaxed text-ink-2">
                We are hiring a Senior Frontend Engineer to build{" "}
                <mark className="kw" style={{ ["--d" as string]: "0.9s" }}>React</mark> and{" "}
                <mark className="kw" style={{ ["--d" as string]: "1.3s" }}>TypeScript</mark> applications with{" "}
                <mark className="kw" style={{ ["--d" as string]: "1.7s" }}>Next.js</mark>, ship with{" "}
                <mark className="kw" style={{ ["--d" as string]: "2.1s" }}>CI/CD</mark> on{" "}
                <mark className="kw" style={{ ["--d" as string]: "2.5s" }}>AWS</mark>, and mentor engineers.
              </p>
            </div>
            <div className="demo-flow mx-auto my-2 h-8 w-px bg-gradient-to-b from-line to-accent" />
            <div className="demo-paper rise relative rounded-2xl border border-line bg-surface p-3 shadow-sm" style={{ animationDelay: "260ms" }}>
              <div className="overflow-hidden rounded-lg border border-line">
                <ResumePaper resume={SAMPLE_RESUME} config={presetById("classic").config} showGuide={false} decorative />
              </div>
              <span className="chip-float absolute -right-2 -top-3 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-ink shadow" style={{ animationDelay: "0.2s" }}>
                92% keyword match
              </span>
              <span className="chip-float absolute -left-2 top-1/3 hidden rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium shadow sm:block" style={{ animationDelay: "1.1s" }}>
                0 invented facts
              </span>
              <span className="chip-float absolute -bottom-3 right-6 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium shadow" style={{ animationDelay: "2s" }}>
                ATS-safe layout
              </span>
            </div>
          </div>
        </section>

        {/* ---------- Format strip ---------- */}
        <section aria-label="Export formats" className="rounded-2xl border border-line bg-surface px-5 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-ink-2">
            <span className="font-medium text-ink">Export to</span>
            {FORMATS.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" className="py-20" aria-labelledby="how-h">
          <h2 id="how-h" className="font-display text-3xl sm:text-4xl">
            Three steps. No design skills.
          </h2>
          <ol className="mt-10 grid gap-5 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.n} className="rise rounded-2xl border border-line bg-surface p-6" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft font-display text-lg text-accent">{s.n}</span>
                <h3 className="mt-4 font-display text-xl">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Template showcase (rendered from the real templates) ---------- */}
        <section id="templates" className="py-4" aria-labelledby="tpl-h">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="tpl-h" className="font-display text-3xl sm:text-4xl">
                {PRESETS.length} templates. All ATS-safe.
              </h2>
              <p className="mt-2 max-w-xl text-ink-2">Each one is a single column of real text. Pick one, then tune the font, spacing, colour and section order.</p>
            </div>
            <Link href="/build" prefetch={false} className="inline-flex min-h-10 items-center text-sm font-medium text-accent underline-offset-4 hover:underline">
              Start with any of them
            </Link>
          </div>
          <div className="mt-8">
          <ShowMore initial={FIRST_SIX} total={FEATURED_FIRST.length} noun="templates" label="Resume templates" fullHref="/ats-resume-templates" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {FEATURED_FIRST.map((p, i) => (
              <ShowMoreItem key={p.id} extra={i >= FIRST_SIX} className="[contain-intrinsic-size:auto_300px] [content-visibility:auto]">
                <Link
                  href={`/build?template=${p.id}`}
                  prefetch={false}
                  className="group block rounded-2xl border border-line bg-surface p-2.5 transition duration-[var(--dur)] ease-[var(--ease-out)] hover:-translate-y-1 hover:border-accent hover:shadow-md"
                >
                  <div className="pointer-events-none aspect-square overflow-hidden rounded-lg border border-line">
                    <ResumePaper resume={SAMPLE_RESUME} config={p.config} showGuide={false} decorative />
                  </div>
                  <div className="px-1 pb-1 pt-3">
                    <p className="font-display text-lg">{p.name}</p>
                    <p className="mt-0.5 text-xs text-ink-2">{p.tags.filter((t) => !/page/i.test(t)).join(" · ")}</p>
                  </div>
                </Link>
              </ShowMoreItem>
            ))}
          </ShowMore>
          </div>
        </section>

        {/* ---------- Honesty ---------- */}
        <section id="honesty" className="mt-20 rounded-3xl bg-ink px-6 py-14 text-bg sm:px-12" aria-labelledby="hon-h">
          <p className="text-xs font-medium uppercase tracking-widest opacity-60">Built different</p>
          <h2 id="hon-h" className="mt-3 max-w-2xl font-display text-3xl sm:text-4xl">
            An AI resume writer that will not make things up.
          </h2>
          <p className="mt-4 max-w-2xl opacity-75">Most tools happily add skills you do not have. This one checks every claim against what you wrote.</p>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3">
            {NEVER.map((n) => (
              <li key={n.t}>
                <p className="font-display text-xl">
                  <span className="mr-2 text-accent" aria-hidden>
                    ✕
                  </span>
                  Never: {n.t}
                </p>
                <p className="mt-2 text-sm leading-relaxed opacity-70">{n.d}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="py-20" aria-labelledby="faq-h">
          <h2 id="faq-h" className="font-display text-3xl sm:text-4xl">
            Questions
          </h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-surface">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span aria-hidden className="text-ink-2 transition-transform duration-[var(--dur)] group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="mb-20 rounded-3xl border border-line bg-accent-soft px-6 py-14 text-center">
          <h2 className="font-display text-3xl sm:text-4xl">Ready for a resume that fits the job?</h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-2">It takes a few minutes, and you stay in control of every word.</p>
          <Link href="/build" prefetch={false} className={`${cta} mt-7`}>
            Build my resume
          </Link>
        </section>

        {/* ---------- Learn (internal links with descriptive text) ---------- */}
        <section className="pb-4" aria-labelledby="learn-h">
          <h2 id="learn-h" className="font-display text-3xl sm:text-4xl">
            Learn what recruiters and ATS software look for
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { href: "/guides/ats-friendly-resume", t: "ATS-friendly resume checklist", d: "The formatting rules that keep your resume readable by software, plus a two-minute test." },
              { href: "/guides/tailor-resume-to-job-description", t: "How to tailor a resume to a job description", d: "A six-step method that matches the job without adding skills you do not have." },
              { href: "/ats-resume-templates", t: "All 23 ATS resume templates", d: "Compare every single-column design with sample data, then open one with your own details." },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} prefetch={false} className="block h-full rounded-2xl border border-line bg-surface p-5 transition hover:border-accent">
                  <span className="font-display text-lg">{l.t}</span>
                  <span className="mt-1 block text-sm text-ink-2">{l.d}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

      </main>
      <SiteFooter wide />
    </>
  );
}
