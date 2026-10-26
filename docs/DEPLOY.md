# Deploying to Vercel: checklist

## Status (2026-10-12)
- **Live:** https://tomcredora.vercel.app (Vercel project `tomesh-hc/tomcredora`, Tokyo region). Deployed by hand with `npx vercel deploy --prod` (not connected to Git yet, so every change needs another deploy).
- Production variables set: `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design), `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_SITE_URL=https://tomcredora.vercel.app`.
- Verified live: all pages 200, canonical/sitemap use the live address, security headers and the Supabase-only CSP, `/api/v1/sync` refuses signed-out and fake-test tokens, and a real AI request returns in about 3 seconds.
- **Still open:** Supabase redirect URL for the live address, Upstash Redis, the `tomcredora.com` domain (then switch `NEXT_PUBLIC_SITE_URL` and redeploy), the real sign-in test, database password reset.

## 0. Your values (already decided)
- Domain: `tomcredora.com` (not registered yet as of 2026-10-12: it did not resolve in DNS). Buy it, for example in Vercel, Domains, which also sets up DNS for you.
- Contact email shown on Privacy and Terms: `tomeshdhongade@gmail.com`.
- Function region: Tokyo (`hnd1`, set in `vercel.json`), next to the Supabase project.
- Supabase Auth, URL configuration: Site URL `https://tomcredora.com`; Redirect URLs `https://tomcredora.com/signin`, `https://tomcredora.vercel.app/signin` and `http://localhost:3200/signin` (the emailed link and Google return to the fixed address `/signin`; the app then sends the person on to the page they came from).

## 1. Accounts and services
- [ ] **Supabase** project with `supabase/setup.sql` applied (run `npm run db:check` first). Auth, URL configuration: Site URL = your production address; add it (with `/**`) to the Redirect URLs.
- [ ] **Upstash Redis** (free): shared rate limits and duplicate-request protection. Without it, limits are per server instance, which protects nothing on Vercel.
- [ ] **Gemini key** (aistudio.google.com/apikey). The free tier allows about 20 requests a day per model, so plan for users bringing their own key, or a paid key.
- [ ] A custom email sender in Supabase (Auth, SMTP). The built-in sender allows only a few emails per hour.

## 2. Environment variables (Vercel, Project Settings, Environment Variables)
| Name | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | your key | server only |
| `NEXT_PUBLIC_SUPABASE_URL` | project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **anon** key | public by design; never the service-role key |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | from Upstash | server only |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` | no trailing slash; drives sitemap, canonicals, share cards |
| `NEXT_PUBLIC_CONTACT_EMAIL` | an address you read | shown on Privacy and Terms |
| `TAILOR_RATE_PER_MIN`, `TAILOR_RATE_PER_DAY` | optional | defaults 6 and 40 per client |
| `GEMINI_MODEL` | optional | comma-separated fallback chain |

**Never set** `AUTH_MODE` or `NEXT_PUBLIC_AUTH_MODE` (the fake test sign-in). It is refused in production anyway.

### Deploy from this machine (after `npx vercel login`, which needs you once)
```
npx vercel link                       # create or pick the project
# push each variable from .env.local without printing it (repeat per name):
#   printf '%s' "$VALUE" | npx vercel env add NAME production
npx vercel deploy --prod
npx vercel domains add tomcredora.com
```

## 3. Before going public
- [ ] Reset the database password if it was ever shared.
- [ ] `npm run lint`, `npm test`, `npm run build`, `npm run perf`, `npm run db:check`.
- [ ] Read the Privacy and Terms pages once and adjust the wording to your situation (they are plain-language templates, not legal advice).
- [ ] Sign in once with a real email link and check that data appears on a second device.

## 4. After deploying
- [ ] Open `/robots.txt`, `/sitemap.xml` and `/opengraph-image` on the live domain.
- [ ] Submit the sitemap in Google Search Console and Bing Webmaster Tools.
- [ ] Test a page in Google's Rich Results Test and a share link in a chat app.
- [ ] Add error monitoring (for example Sentry) and watch the first days of logs.
