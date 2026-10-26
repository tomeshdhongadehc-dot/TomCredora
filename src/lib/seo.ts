import type { Metadata } from "next";
import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

/**
 * Structured data (schema.org JSON-LD) so search engines understand what the site is. Everything here is built from
 * our own fixed text, never from user input, and only describes things that are really on the page: no ratings,
 * reviews or counts we cannot back up.
 */
/** A page that sets its own social tags replaces the shared ones, so the share image has to be named again here. */
const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE_NAME}: ${HOME_TITLE}` };

const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;

export const websiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "en",
});

export const webAppLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any (web browser)",
  browserRequirements: "Requires JavaScript",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "ATS-friendly single-column resume templates",
    "Tailors a resume to a job description without inventing skills",
    "Exports to PDF, Word, LaTeX, HTML and plain text",
    "Works without sign-up; optional account sync",
  ],
});

export const breadcrumbLd = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
});

export const articleLd = (a: { title: string; description: string; path: string; published: string; modified: string }) => ({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: a.title,
  description: a.description,
  mainEntityOfPage: abs(a.path),
  url: abs(a.path),
  datePublished: a.published,
  dateModified: a.modified,
  inLanguage: "en",
  author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  image: `${SITE_URL}/opengraph-image`,
});

/** Only for questions and answers that are visible on the same page. */
export const faqLd = (items: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
});

/** Page metadata with its own canonical address, social card text and the right robots rule. */
export function pageMeta(o: { title: string; description: string; path: string; index?: boolean; type?: "website" | "article" }): Metadata {
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: o.path },
    robots: o.index === false ? { index: false, follow: false } : undefined,
    openGraph: { type: o.type ?? "website", siteName: SITE_NAME, title: o.title, description: o.description, url: o.path, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: o.title, description: o.description, images: [OG_IMAGE.url] },
  };
}

/** For the tool pages (studio, builder, quick, profile): useful to people, empty for a crawler. */
export const noIndexMeta = (title: string): Metadata => ({ title, robots: { index: false, follow: false } });

export const HOME_META = pageMeta({ title: HOME_TITLE, description: "Paste a job description, get an ATS-friendly resume tailored to it. 23 templates, PDF/Word/LaTeX export, no sign-up, and AI that never invents your skills.", path: "/" });
