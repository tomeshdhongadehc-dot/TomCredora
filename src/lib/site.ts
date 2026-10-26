/**
 * Public site settings, read from build-time variables so the server and the browser agree.
 *   NEXT_PUBLIC_SITE_URL       the public address (https://yourdomain.com): used for the sitemap, share cards and canonical links
 *   NEXT_PUBLIC_CONTACT_EMAIL  shown on the privacy and terms pages; the line is left out when it is not set
 */
const clean = (v: string | undefined) => v?.trim().replace(/\/+$/, "") || "";

export const SITE_URL = clean(process.env.NEXT_PUBLIC_SITE_URL) || "http://localhost:3200";
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";
export const SITE_NAME = "TomCredora";
export const SITE_DESCRIPTION = "Paste a job description, get a concise, ATS-friendly resume tailored to it. Truthful, editable, exportable.";

/** The pages that are meant to be found in search. The tool pages (studio, build, quick, profile) are not listed. */
export const PUBLIC_PATHS = ["/", "/ats-resume-templates", "/guides/ats-friendly-resume", "/guides/tailor-resume-to-job-description", "/privacy", "/terms"] as const;

/** Default page title and description for the home page (kept inside the length search results show). */
export const HOME_TITLE = "Free ATS Resume Builder: Tailor Your Resume to Any Job";
export const KEYWORDS = ["ATS resume builder", "resume tailored to job description", "ATS-friendly resume templates", "resume keyword optimizer", "free resume builder", "resume AI"];

/** The date the legal pages were last changed. Update it whenever their text changes. */
export const LEGAL_UPDATED = "12 October 2026";
