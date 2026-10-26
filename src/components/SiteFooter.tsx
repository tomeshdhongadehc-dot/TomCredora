import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

const COLS = [
  {
    title: "Build",
    links: [
      { href: "/quick", label: "Quick resume" },
      { href: "/profile", label: "My profile" },
      { href: "/studio", label: "Workspace" },
      { href: "/build", label: "Guided builder" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/ats-resume-templates", label: "ATS resume templates" },
      { href: "/guides/ats-friendly-resume", label: "ATS-friendly resume checklist" },
      { href: "/guides/tailor-resume-to-job-description", label: "Tailor a resume to a job" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

/** Site-wide footer: crawlable links to every public page, with descriptive text. Placed OUTSIDE <main>, so it is the page's footer landmark. */
export function SiteFooter({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="mt-20 border-t border-line text-sm text-ink-2">
      <div className={`mx-auto grid w-full gap-8 px-5 py-10 sm:grid-cols-[1.2fr_repeat(3,1fr)] sm:px-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div>
          <p className="font-display text-base text-ink">{SITE_NAME}</p>
          <p className="mt-2 max-w-xs">Your name, email, phone and links are never sent to the AI. Without an account, your data stays in your browser.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="font-medium text-ink">{c.title}</p>
            <ul className="mt-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={false} className="inline-flex min-h-8 items-center hover:text-ink hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
