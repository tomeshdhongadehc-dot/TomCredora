"use client";

import { useMemo, useState } from "react";
import { scoreResume } from "@/lib/ats-score";
import { cleanResume } from "@/lib/clean";
import { extractKeywords } from "@/lib/keywords";
import { ledgerKey, pendingConfirmations, type LedgerEntryState as LedgerEntry, type ReviewState } from "@/lib/review-state";
import type { Resume } from "@/lib/schema";
import { addSkill, isKnownSkill, skillDisplay } from "@/lib/skill-gap";
import { useGeminiKey, useTailor } from "@/lib/tailor-client";
import { ScoreRing } from "../ScoreRing";
import { Button, Card, Chip } from "../ui";

interface Props {
  resume: Resume;
  jd: string;
  replaceResume: (r: Resume) => void;
  /** Saved with the draft so unverified bullets keep their warning across steps and reloads. */
  review: ReviewState | null;
  setReview: (fn: (r: ReviewState | null) => ReviewState | null) => void;
}

export function ReviewStep({ resume, jd, replaceResume, review, setReview }: Props) {
  const keywords = useMemo(() => extractKeywords(jd), [jd]);
  const report = useMemo(() => scoreResume(cleanResume(resume), keywords), [resume, keywords]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tailored = review;
  const { apiKey, saveKey } = useGeminiKey();
  const tailor = useTailor(apiKey);

  async function generate() {
    setError(null);
    setBusy(true);
    const r = await tailor(resume, jd);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    replaceResume(r.resume);
    setReview(() => r.review);
  }

  // Bullets the verifier could not fully vouch for. The user decides: keep the AI wording or go back to their own.
  const bulletAt = (roleId: string, position: number) => resume.experience.find((e) => e.id === roleId)?.bullets[position];
  const pending = pendingConfirmations(review, bulletAt);
  const resolve = (l: LedgerEntry) => setReview((r) => (r ? { ...r, resolved: [...r.resolved, ledgerKey(l)] } : r));
  function revertToOriginal(l: LedgerEntry) {
    if (l.original === null || bulletAt(l.roleId, l.position) !== l.text) return; // user edited it since: do not clobber their edit
    replaceResume({
      ...resume,
      experience: resume.experience.map((e) => (e.id === l.roleId ? { ...e, bullets: e.bullets.map((b, i) => (i === l.position ? l.original! : b)) } : e)),
    });
    resolve(l);
  }

  const failing = report.checks.filter((c) => !c.pass);
  const unverified = tailored?.ledger.filter((l) => l.status === "needs-confirmation").length ?? 0;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ScoreRing score={report.score} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl">Your resume vs. this job</h2>
            <p className="mt-1 text-sm text-ink-2">
              Keyword coverage {report.coverage.pct}% plus {report.checks.length - failing.length}/{report.checks.length} format checks. A guide, not a guarantee.
            </p>
            <Button className="mt-4" onClick={generate} disabled={busy || jd.trim().length < 40} aria-busy={busy}>
              {busy ? "Tailoring..." : tailored ? "Tailor again" : "Tailor with AI"}
            </Button>
            {jd.trim().length < 40 && <p className="mt-2 text-xs text-ink-2">Add the job description to enable AI tailoring.</p>}
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer py-2 text-ink-2 hover:text-ink">Use your own Gemini key (free)</summary>
              <div className="mt-2 space-y-1.5">
                <label htmlFor="gkey" className="block text-xs text-ink-2">
                  Get a free key at aistudio.google.com/apikey. It stays in this tab only and is sent only to this app&apos;s server to make your request.
                </label>
                <input
                  id="gkey"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(e) => saveKey(e.target.value)}
                  placeholder="Paste your Gemini API key"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              </div>
            </details>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
      </Card>

      {tailored && (
        <Card className="rise">
          <h3 className="font-medium">AI result</h3>
          <p className="mt-1 text-sm text-ink-2">
            {tailored.ledger.length - unverified} bullets verified against your profile
            {unverified > 0 && `, ${unverified} need your confirmation`}. Anything invented was dropped and your original wording kept.
          </p>
          {pending.length > 0 && (
            <div className="mt-4 rounded-xl border border-warn/40 bg-warn-soft/50 p-3" role="region" aria-label="Bullets to confirm">
              <h4 className="text-sm font-medium text-warn">Please confirm {pending.length === 1 ? "this bullet" : `these ${pending.length} bullets`}</h4>
              <p className="text-xs text-ink-2">The AI added wording that is not in what you wrote. Keep it only if it is true.</p>
              <ul className="mt-3 space-y-3">
                {pending.map((l) => (
                  <li key={ledgerKey(l)} className="rounded-lg bg-surface p-3 text-sm">
                    <p><span className="font-medium">AI wrote:</span> {l.text}</p>
                    {l.original && <p className="mt-1 text-ink-2"><span className="font-medium">You wrote:</span> {l.original}</p>}
                    {l.reasons[0] && <p className="mt-1 text-xs text-warn">{l.reasons[0]}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => resolve(l)}>It is true, keep it</Button>
                      {l.original && (
                        <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => revertToOriginal(l)}>Use my original</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tailored.questions.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium">Add these facts for a stronger resume</h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
                {tailored.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card>
        <h3 className="font-medium">Keywords</h3>
        {keywords.length === 0 ? (
          <p className="mt-1 text-sm text-ink-2">Paste a job description to see keyword coverage.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2" aria-label="Matched keywords">
              {report.coverage.matched.map((k) => (
                <Chip key={k} tone="good">
                  ✓ {skillDisplay(k)}
                </Chip>
              ))}
            </div>
            {report.coverage.missing.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-ink-2">Missing. Add only what is true for you (tap a skill you have to add it to your skills):</p>
                <div className="flex flex-wrap gap-2" aria-label="Missing keywords">
                  {report.coverage.missing.map((k) =>
                    isKnownSkill(k) ? (
                      <button key={k} type="button" aria-label={`Add ${skillDisplay(k)} to my skills (I have this)`} onClick={() => replaceResume(addSkill(resume, skillDisplay(k)))}
                        className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn transition hover:brightness-95">
                        + {skillDisplay(k)}
                      </button>
                    ) : (
                      <Chip key={k} tone="bad">
                        {skillDisplay(k)}
                      </Chip>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {failing.length > 0 && (
        <Card>
          <h3 className="font-medium">Fix these</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {failing.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span aria-hidden className="text-warn">●</span>
                <span>
                  {c.label}
                  {c.hint && <span className="block text-xs text-ink-2">{c.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
