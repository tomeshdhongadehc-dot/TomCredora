# TomCredora

Paste a job description, add your details once, get a concise, ATS-friendly resume tailored to the job. Edit it live, pick a template, export PDF / DOCX / LaTeX (Overleaf) / a standalone HTML + CSS web page.

**Principle: it never invents facts.** The AI only rewords what you wrote; every number, skill and technology it returns is checked against your profile, and anything unsupported is dropped.

## Run it

```bash
npm install
cp .env.example .env.local     # add GEMINI_API_KEY (free: https://aistudio.google.com/apikey)
npm run dev                    # http://localhost:3200 (always this port; tests use 3201 and their own .next-test folder, so both can run together)
```

Without a key everything works except "Tailor with AI" (you get a clear message). Your draft lives in your browser's localStorage.

## Templates

Twenty-three original, single-column ATS-safe templates (no tables, icons, images or text boxes), all driven by one config so the preview, PDF, DOCX and LaTeX always match:

| Template | For | What makes it different |
|---|---|---|
| Classic | Any industry | Centered header, ruled headings, company leads each entry |
| Modern | Tech, design | Left header, one accent colour, no rules, dash bullets |
| Compact | Senior, dense | 10pt, tight spacing, narrow margins |
| Academic | Research, finance | Serif, education first, title-case headings |
| Engineer | Technical roles | Job title leads each entry, skills up top, projects |
| Executive | Leadership | Large accent name, serif, core-competencies line, 2 pages |
| Minimal | Simple / parser-first | No rules or colour, every entry on one linear line |
| Graduate | Students, early career | Education and projects first |
| Slate | Corporate, consulting | Capitalised letter-spaced name over a rule, accent bars on headings |
| Ledger | Finance, legal | Formal serif, capitalised name, short accent ticks under headings |
| Spotlight | Sales, marketing | Bold accent-coloured name, single-line entries, skills strip |
| Pioneer | Startups, product | Centred and airy, ring bullets, green ticks |
| Curve | Academic, research | Centred accent-blue name, dot-separated contact line, heading-less intro, coloured lead terms with em dashes |
| Scholar | Academic, research | Three-column header (details left, name centred, links right), small-caps headings, bold dates, aligned skills columns. The header is the most designed part: check the plain-text view |
| Standard | Any industry | Centred header with underlined contact line, title-case ruled headings, one-line projects, "Technical Skills" |
| Sprint | Software students, dense 1 page | Small-caps ruled headings, one-line projects, education first (Jake's-Resume-style layout) |
| Crimson | Finance, consulting, grad school | Capitalised serif name, bold dates, education first, no colour (career-office format) |
| Vivid | Tech, product, design | Accent name and headings, coloured job titles, aligned skills (Awesome-CV-style) |
| Banner | Senior, corporate | Serif, accent bar beside headings, stacked grey contact details (moderncv-style) |
| Onyx | Startups, product | Accent name over a thick rule, grey dot-separated contact line (Reactive-Resume-style) |
| Horizon | Tech, product, corporate | Solid accent header band with white text, shaded section titles, aligned skills |
| Tint | Finance, legal, academia | Centred serif caps name over a rule, small-caps titles on a soft tint |
| Atlas | Senior, leadership | Maroon header band with centred serif name, accent bars on headings, bold dates |

**Custom templates.** Start from any template, then arrange it: drag (or use the arrows) to reorder sections, hide sections, rename headings, choose which contact details show and in what order, set header position, stack or inline the contact line, and tune spacing. Save the result under "My templates" (kept in this browser, up to 12) and reuse it. Every output (preview, PDF, Word, LaTeX, HTML/CSS, text) follows the same arrangement. Guard rails warn, but never block, if you hide your email, hide Experience, or use a heading name an ATS may not recognise.

Every template is customisable (font, size, spacing, margins, paper, accent, headings, bullets, entry order, date style, skills style, section order) with guard-rail warnings for settings that hurt readability or parsing. The **Scholar** and **Standard** layouts are inspired by two community Overleaf templates (licences not verified; only the visual idea was used, no code or text copied). The **Curve** template is inspired by the layout of LianTze Lim's "A Customised CurVe CV" (Overleaf, CC BY 4.0). Only the visual idea was used; no code or text was copied. Designs are original: the web research on template conventions (single column, standard fonts and headings, no icons) informed the structure, and no third-party template code was copied.

## Four ways to work

- **My profile** (`/profile`): the details that are the same for every job, filled mostly by tapping. Pick your field (Software, Data, Design, Product, Marketing, Sales, Finance, Operations, HR, Support) and get tap-to-add skills by category, job titles, one-tap "what did you do" duties, popular certifications, month/year pickers and "I work here now". Typing is only for name, contact, company and school. A strength meter says what to add next. Every resume is **seeded from the profile** (the first empty resume once, and "New from my profile" in My resumes); the AI then writes the summary and sharpens bullets on a *copy*, so the profile is never rewritten. Duty suggestions contain no numbers or results on purpose, so the app never suggests an invented outcome. Stored in this browser (`arb.profile.v1`).
- **Back never loses your place.** Everything you type is saved as you go, and again the instant you leave a field or the page. The guided builder gives each step its own address (`/build?step=job`), so the browser's Back and Forward buttons move between steps like the pages of a form, and a reload stays on the same step. Text typed into an "add your own" box but not yet added is kept for the tab until you add or clear it.
- **Templates on the home page.** Six are shown first (a spread of looks), with a "View all 23 templates" button. The rest are hidden, not removed: they stay in the page for search engines, and a plain link to the full comparison page works without JavaScript.
- **Quick resume** (`/quick`): one screen from your profile to a finished resume. Paste a job description, pick a template (Classic by default), tick "these details are accurate" (the exact details sent are shown, and the tick is withdrawn if you change one), and press one button. Typical time with live Gemini: about 3-6 seconds. **Job skills:** once a job is pasted, the page lists the skills it asks for. Ones you have are listed first on the resume in the job's wording ("JS" becomes "JavaScript"). Ones your profile never mentions are NOT added: each is a "+ Skill (I have this)" button you tap only if it is true, and tapped skills are saved to your profile and sent to the AI. The same one-tap add exists on the missing keywords after generating. Exports, the AI's wording checks, keywords and ATS score appear below the result.
- **Guided mode** (`/build`): a four-step wizard (Profile, Job, Review, Design & Export). Best for a first resume.
- **Workspace** (`/studio`): a three-pane editor. Left: every section editable (Basics, Summary, Experience, Education, Skills, Projects, Certifications) with add, duplicate, delete, drag or arrow reordering, and per-bullet editing with word counts. Centre: the live resume with zoom. Right: tabs for Templates, Style & layout, Job & AI (paste a job description, tailor, confirm AI wording) and Export. Header: undo / redo (typing coalesces into one step; Ctrl+Z works outside text fields and the browser's own undo applies inside them) and **My resumes**.
- **My resumes**: keep up to 20 resumes in this browser; create blank or from the example, switch, rename, duplicate, delete (with confirmation), import a `.json` backup and export one. The two modes share the same data, so you can switch freely. A draft from the earlier single-resume version is migrated automatically into a resume called "My resume" (the old copy is left in place as a backup).

Storage is `localStorage` only: `arb.workspace.v1` (the list) and `arb.resume.<id>` (one entry per resume). Everything read back is validated, so a corrupted or hand-edited value falls back to defaults instead of breaking the app. Limits: if you open the app in two tabs, the last tab to save wins.

## Exports

PDF (browser print, text-based), DOCX, LaTeX (`.tex` + Open in Overleaf), plain text, JSON backup, and a self-contained **HTML page + CSS file**. The HTML export is produced by the same component as the preview, so it matches the template exactly (verified: 0.0000% pixel difference on all 8 templates). It has no scripts or external requests and carries a CSP that enforces that.

## AI model and free-tier limits (read this before deploying)

- Default model chain: `gemini-3.5-flash` -> `gemini-3.1-flash-lite` -> `gemini-3.8-flash` -> `gemini-flash-latest` (fastest first; each model gets 12s before the next is tried). The adapter falls back automatically on retired-model (404), quota (429) and overload (5xx) errors. Override with `GEMINI_MODEL="a,b,c"`. `gemini-2.5-*` already returns 404 for new keys, so check model availability periodically.
- **The free tier allows only about 20 requests per day per model per project** (measured on a real key). One shared server key cannot serve many users. Options: let users paste their own free key (built in, under "Use your own Gemini key" on the Review step), or enable billing on the project. When all models are exhausted the API answers with a clear "free quota used up" message.
- A typical tailoring call uses about 750 input and 450 output tokens.

## Truthfulness checks

The model does embellish (live evals: invented outcomes such as "to maintain application stability", "active users", skills copied from the JD). Three layers catch it: schema validation, **grounding** (numbers, technologies and skills must exist in the profile; violations are removed), and an **embellishment check** (new wording or invented purpose/outcome clauses are flagged). Flagged bullets appear in a "Please confirm" panel next to the user's own wording with a one-click "Use my original". That state is saved with the draft so a warning can never disappear by navigating away or reloading. Finished roles are forced into past tense and bullets lose trailing periods deterministically.

## Scripts

| Command | What it does |
|---|---|
| `npm run check` | typecheck + lint + unit tests |
| `npm test` | unit tests (Vitest) |
| `npm run test:e2e` | browser tests (Playwright, desktop + mobile): flows, exports, PDF text extraction, axe accessibility, security |
| `npm run perf` | builds, serves and measures the production build against budgets (JS before load, LCP, CLS, lazy loading) |
| `npm run tex:check` | compiles all 8 templates (normal + hostile/multilingual content) with real pdfLaTeX via texlive.net; sends sample data only |
| `npm run evals` | **live** prompt evaluation against Gemini (needs `GEMINI_API_KEY`) |

## Architecture

```
src/lib/schema.ts        Resume schema (zod): the single source of truth
src/lib/templates.ts     Template config + 4 presets + ATS guard rails (drives preview AND every export)
src/lib/keywords.ts      Deterministic JD keyword extraction + coverage (no AI)
src/lib/ats-score.ts     Heuristic ATS checks + score
src/lib/ai/              Provider interface, Gemini adapter, versioned prompts, verifier (checks.ts), orchestrator (tailor.ts)
src/lib/export/          latex.ts, docx.ts, plaintext.ts, files.ts (all pure, take Resume + TemplateConfig)
src/lib/api/             Handlers (framework-free, unit-testable): tailor, resumes; idempotency, rate limit, guards
src/components/          ResumePaper (preview/thumbnail/print), builder steps
supabase/migrations/     Postgres schema with row-level security
evals/                   Live prompt evals
```

### The AI pipeline (token-minimal)
1. JD keywords extracted locally (no tokens).
2. One Gemini call: compact profile (no contact details) + keywords -> JSON (schema-enforced).
3. One cheap repair retry only on invalid JSON.
4. Verifier: schema, **fact grounding** (numbers, technologies, skills, ids), style lint, leak/injection check. Failures are dropped and the user's original wording kept. Each bullet is marked verified / needs-confirmation.
5. Coverage and ATS score are computed locally; the model's own claims are never trusted.

Changing the system prompt requires bumping `TAILOR_PROMPT_VERSION` (a hash test enforces this) and re-running `npm run evals`.

### Swapping the AI provider
Implement `LLMProvider` (`src/lib/ai/provider.ts`) and return it from `src/app/api/v1/tailor/route.ts`. Prompts and checks are provider-agnostic.

## Search engine optimisation (SEO)

Public pages (`/`, `/ats-resume-templates`, two guides, `/privacy`, `/terms`) are server-rendered static HTML with a unique title and description, their own canonical address, social-card tags and a share image, plus structured data (WebSite, WebApplication and FAQPage on the home page; Article and BreadcrumbList on guides). The tool pages (`/studio`, `/build`, `/quick`, `/profile`) are marked noindex. `robots.txt`, `sitemap.xml`, the web manifest, icons and a real 404 page are generated by the app. The structured data never claims ratings or reviews. Template thumbnails contain no headings, so every page has exactly one `h1`.

Set `NEXT_PUBLIC_SITE_URL` (and `NEXT_PUBLIC_CONTACT_EMAIL`) in production. After deploying, submit `https://your-domain/sitemap.xml` in Google Search Console and Bing Webmaster Tools and check a page with Google's Rich Results Test. `e2e/seo.spec.ts` guards all of this: lengths, canonicals, one h1, structured data matching the visible FAQs, the sitemap, the share image, noindex, and no dead links. See `docs/DEPLOY.md` for the full go-live checklist.

## Accounts and sync

Optional, and off until configured: with no Supabase variables there is no sign-in button and the app stays local-only.

**Set it up**
1. Create a free project at supabase.com.
2. In the SQL editor run `supabase/migrations/0001_init.sql`, then `0002_user_data.sql`.
3. Authentication, URL configuration: set the Site URL (`http://localhost:3200` locally, your domain in production) and add both to the redirect URLs.
4. Authentication, Providers: Email is on by default (a sign-in link, no passwords). For Google, enable it and add a Google OAuth client id and secret.
5. Put the project URL and the anon key in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and in Vercel). Never use the service-role key here.

**The sign-in page** (`/signin`): email link or Google, no password. The header's "Sign in" link opens it and remembers where you were (`/signin?next=/studio`), then sends you back after signing in. It is phone-first (one column, 48px controls, 16px fields so iPhones do not zoom, safe-area padding) and from 1024px shows the benefits beside the form. It validates the address inline, shows a "Check your email" state with a 30-second resend countdown, explains an expired or used link, and shows your account instead of the form if you are already signed in. Only same-site paths are ever followed after sign-in (tested against open-redirect tricks). Because the emailed link returns to a fixed address, the Supabase redirect list needs exactly `https://your-domain/signin` (and `http://localhost:3200/signin` for local use).

**How it behaves**
- Signed out, nothing changes: everything stays in this browser.
- Signing in merges this browser with your account, so signing in on a second device brings your profile and resumes, and clearing your browser's data is recoverable.
- Each resume and the profile carry a last-edited time. Both sides are merged (newer copy of each resume wins; a deleted resume stays deleted unless it is edited after the delete), so two devices never overwrite each other's work. Syncs run after you stop editing, when the tab regains focus, when you come back online, and from "Sync now".
- A sync never overwrites something you typed while it was waiting for the network, and a failed or offline sync leaves your local data untouched.
- Signing out keeps this device's data; "Sign out and clear this device" removes it (shared computers). "Delete my saved data" removes the copy on our servers.
- Limits: 20 resumes, 1MB of data. Not synced: which resume is open, undo history, and your own Gemini key.
- For demos and automated tests there is a fake sign-in: set `AUTH_MODE=mock` and `NEXT_PUBLIC_AUTH_MODE=mock`. It is refused in production builds.

## Deploy (Vercel)

1. Import the repo in Vercel; set env vars from `.env.example`.
2. **Required for production:** `UPSTASH_REDIS_REST_URL` / `_TOKEN` (shared rate limits + idempotency; without them they are per-instance).
3. Optional accounts and sync: see "Accounts and sync" above (run both migrations, set the two `NEXT_PUBLIC_SUPABASE_*` vars).
4. PDF export uses the browser's print engine, so there is no server-side PDF cost or timeout risk.

## Status / known limits
- Sign-in and sync are built (sign-in dialog, merge engine, `/api/v1/sync`, migrations) and tested end to end against an in-memory server with a test-only sign-in. The Supabase adapters, the RLS policies and the real email-link and Google sign-in have **not** been run against a live project yet.
- LaTeX: all 16 sample documents compile with real pdfLaTeX (`npm run tex:check`). pdfLaTeX cannot typeset non-Latin scripts: other letters become "?" and emoji are dropped rather than breaking compilation. The Overleaf button posts to `overleaf.com/docs`; it still needs a one-time manual check while logged in.
- PDF = browser print dialog ("Save as PDF"). Text is selectable (verified by extraction in e2e).
- Number-in-words ("twelve thousand") is not covered by the numeric grounding check.
- See `docs/THREAT_MODEL.md`.
