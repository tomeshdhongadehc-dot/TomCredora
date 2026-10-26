# Threat model (STRIDE, lightweight)

**Assets:** users' resume data (PII), the Gemini quota/cost, account sessions, integrity of resume content.

| Threat | Where | Mitigation | Tested by |
|---|---|---|---|
| **S**poofing / unauthenticated access | `/api/v1/resumes*` | Bearer token verified with Supabase `getUser()`; 401 otherwise | `resumes-api.test.ts`, `security.spec.ts` |
| **T**ampering: stale overwrite | resume PUT | Required `If-Match` ETag, 412 on conflict | `resumes-api.test.ts` |
| **T**ampering: mass assignment | all JSON bodies | `z.strictObject` everywhere; ids/owner/version never accepted | `resumes-api.test.ts` |
| **T**ampering: tampered localStorage | draft | Re-validated on load, falls back to defaults | `security.spec.ts` |
| **R**epudiation | writes | Request id on every response and log line; no PII in logs | `errors.ts` |
| **I**nformation disclosure: IDOR | resume by id | Repo always scoped by user id; foreign id == missing id (404); RLS as backstop | `resumes-api.test.ts` |
| **I**nformation disclosure: error leakage | all routes | Uniform error body, no stack/internal text | `api.test.ts`, `resumes-api.test.ts` |
| **I**nformation disclosure: PII to the model | tailor | Contact details never sent; only experience/skills | `prompt.test.ts`, `tailor.test.ts` |
| **D**enial of service / cost abuse | tailor | Per-client rate limits (minute + day), body cap 64KB, JD cap, 25s timeout, idempotency prevents duplicate spend | `api.test.ts`, `concurrency.test.ts` |
| **D**oS via duplicate concurrent requests | tailor | Atomic idempotency claim (memory + Redis): 5 parallel identical requests = 1 AI call | `concurrency.test.ts` |
| **E**levation: prompt injection (JD or profile) | AI pipeline | Delimited untrusted blocks, forged tags neutralised (incl. fullwidth), JSON-only schema output, deterministic verifier, no tools/URLs for the model | `prompt.test.ts`, `verifier-adversarial.test.ts`, evals |
| BYOK Gemini key exposure | Review step | Stored in `sessionStorage` only (not localStorage, not the saved draft); sent in a header to our own API only; never logged or stored server-side; password-masked input | `confirm-and-key.spec.ts` |
| Subtle embellishment shipped as fact | AI output | Embellishment check flags new wording / invented outcome clauses; user must confirm or revert; warning state persists across navigation and reload | `embellishment.test.ts`, `confirm-and-key.spec.ts` |
| Hallucinated facts shipped as real | AI output | Grounding check on numbers/tech/skills with Unicode canonicalisation (fullwidth digits, zero-width chars) | `verifier-adversarial.test.ts` |
| XSS | preview/exports | React escaping; no `dangerouslySetInnerHTML`; strict CSP (no `object-src`, `frame-ancestors none`) | `security.spec.ts` |
| LaTeX injection (`\input`, `\write18`) | `.tex` export | Single-pass escaping of all user text; fuzz-tested | `escape.test.ts`, `export.test.ts` |
| CSRF | cookie/browser writes | Origin check on mutating routes; JSON-only content type | `api.test.ts`, `security.spec.ts` |
| SSRF | n/a today | No server-side URL fetching exists. If "import JD from URL" is added it must use an allowlist and block private ranges | - |
| **S**poofing: someone else's sync data | `/api/v1/sync` | The user id comes only from the verified token, never from the body (unknown fields are rejected); storage is scoped by it; RLS on `user_data` as backstop | `sync-api.test.ts` (isolation, identity-from-token), `account.spec.ts` (accounts are separate) |
| **T**ampering: lost update between devices | sync PUT | Compare-and-swap on a version (`If-Match` / `If-None-Match: *`); 412 on conflict; the client re-reads, merges (commutative, idempotent, associative: property-tested) and retries | `sync-api.test.ts`, `sync-merge.test.ts`, `sync-engine.test.ts` (races) |
| **T**ampering: hostile or corrupt synced data | sync GET/PUT | Strict wire schema, size caps (1MB, 20 resumes, 100 deletions), then lenient sanitising on both server and client: control chars, unknown fields and oversized text dropped; corrupt cloud data is refused and local data is left untouched | `sync-merge.test.ts`, `sync-api.test.ts`, `sync-engine.test.ts` |
| **I**nformation disclosure: token theft | browser session | Bearer token only (no cookie, so no CSRF surface); strict CSP limits XSS; token sent only to our own API | `security.spec.ts` |
| **E**levation: test-only sign-in reaching production | `AUTH_MODE=mock` | Refused whenever `NODE_ENV=production` (a production build and `next start` set it), and absent unless explicitly enabled; unit-tested both ways | `sync-api.test.ts` |
| **D**oS / abuse: sync endpoint | `/api/v1/sync` | Per-user limits (30 writes / 120 reads per minute), body cap, one document per user | `sync-api.test.ts` |
| **I**nformation disclosure: right to erasure | account data | "Delete my saved data" removes the stored row for real (RLS allows own-row delete); signing out keeps or clears the local copy as the user chooses | `account.spec.ts` |
| **T**ampering: script injection through structured data | JSON-LD on public pages | The one use of `dangerouslySetInnerHTML` renders fixed text from our own code, never user input, with `<` escaped so it cannot close the tag | `seo.spec.ts` (no `</` in any JSON-LD), `seo.test.ts` |
| **I**nformation disclosure: contact details reaching our server or the AI | tailor request | The app sends a placeholder contact block; real name, email, phone, location and links never leave the browser during tailoring and are restored on the result locally | `quick.spec.ts` |
| Supply chain | deps | Lockfile + `npm ci`, `npm audit` in CI, client-bundle secret grep | CI |

**Residual risks / open items**
- CSP still allows `'unsafe-inline'` scripts (Next inline bootstrap); nonce-based CSP is the next hardening step.
- BYOK Gemini keys travel in a header on each request (never stored or logged server-side). Users should treat them as lower-trust keys.
- Rate limiting by IP is bypassable by distributed clients; per-user limits apply once accounts are enabled.
- Supabase RLS policies (`0001_init.sql`, `0002_user_data.sql`) are reviewed but untested against a live database; the Supabase adapters and the real email/Google sign-in have not been run against a live project (the whole flow is tested with a faithful in-memory server and a test-only sign-in).
- Sync merges per resume with last-edit-wins: two devices editing the SAME resume at the same moment keep the newer copy, not a field-by-field merge.
- A signed-in browser keeps its Supabase session in localStorage, so an XSS bug would expose it; the CSP is the mitigation (nonce-based CSP still open).
- Account data is stored as plain JSON in Supabase (encrypted at rest by the provider, not end-to-end encrypted).
