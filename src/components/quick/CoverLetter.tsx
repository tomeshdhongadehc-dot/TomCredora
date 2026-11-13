"use client";

import { useState } from "react";
import { MAX_LETTER_CHARS } from "@/lib/draft-model";
import { callAi } from "@/lib/ai-client";
import type { CoverResult, CoverTone } from "@/lib/ai/polish";
import { ANONYMOUS_CONTACT } from "@/lib/tailor-client";
import { announceExport } from "@/lib/export/events";
import { downloadBlob, downloadText, exportFileName } from "@/lib/export/files";
import type { Resume } from "@/lib/schema";
import { Button, Card } from "../ui";

const TONES: { id: CoverTone; label: string; hint: string }[] = [
  { id: "professional", label: "Professional", hint: "Formal and precise" },
  { id: "warm", label: "Warm", hint: "Friendly, still professional" },
  { id: "concise", label: "Short", hint: "Three brief paragraphs" },
];

/** The finished letter: the real name and contact are put on here, after the AI is done (they are never sent to it). */
export function assembleLetter(paragraphs: string[], r: Resume, company: string): string {
  const c = r.contact;
  const top = [c.fullName, [c.email, c.phone].filter(Boolean).join(" | "), c.location].filter(Boolean).join("\n");
  const greeting = company.trim() ? `Dear ${company.trim()} hiring team,` : "Dear Hiring Manager,";
  return [top, greeting, ...paragraphs, `Sincerely,\n${c.fullName}`].filter(Boolean).join("\n\n");
}

/**
 * A cover letter from the same job description and profile. It may only use facts from the profile; if it mentions a
 * number or skill that is not there, the person is told. The letter is editable text, so it is theirs to change.
 */
export function CoverLetter({ resume, jd, company, apiKey, saved, onSave }: { resume: Resume; jd: string; company: string; apiKey: string; saved: string; onSave: (letter: string) => void }) {
  const [tone, setTone] = useState<CoverTone>("professional");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // the letter is part of the saved resume, so it comes back on reload and on your other devices
  const text = saved;
  const save = (v: string) => onSave(v.slice(0, MAX_LETTER_CHARS));

  async function write() {
    setBusy(true);
    setError(null);
    setWarnings([]);
    // the AI gets the experience and skills, never the contact details
    const r = await callAi<CoverResult>("/api/v1/cover-letter", { profile: { ...resume, contact: ANONYMOUS_CONTACT }, jd, company, tone }, apiKey);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    save(assembleLetter(r.data.paragraphs, resume, company));
    setWarnings(r.data.warnings);
  }

  const fileBase = exportFileName(resume, "txt", "Cover_letter");
  return (
    <Card>
      <h2 className="font-display text-xl">Cover letter</h2>
      <p className="mt-1 text-sm text-ink-2">Written from your profile and this job. It can only use what is in your profile. Your contact details are added here and never sent to the AI.</p>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium">Tone</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TONES.map((t) => (
            <label key={t.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${tone === t.id ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
              <input type="radio" name="cover-tone" value={t.id} checked={tone === t.id} onChange={() => setTone(t.id)} className="size-4 accent-[var(--accent)]" />
              <span>
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs text-ink-2">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <Button className="min-h-11 w-full sm:w-auto" onClick={write} disabled={busy || jd.trim().length < 40} aria-busy={busy}>
          {busy ? "Writing…" : text ? "Write it again" : "Write my cover letter"}
        </Button>
        {jd.trim().length < 40 && <p className="mt-2 text-xs text-ink-2">Add the job description above first.</p>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

      {text && (
        <div className="mt-4 space-y-3">
          {warnings.length > 0 && (
            <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn" role="note" aria-label="Facts to check">
              <p className="font-medium">Check these before you send it</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Edit the letter below to fix or remove them.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="cover-text" className="block text-sm font-medium">Your letter (you can edit it)</label>
            <textarea
              id="cover-text"
              value={text}
              onChange={(e) => save(e.target.value)}
              rows={16}
              maxLength={6000}
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-base leading-relaxed sm:text-sm"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="group" aria-label="Save the letter">
            <Button
              variant="ghost"
              className="min-h-11 w-full sm:w-auto"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  announceExport();
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setError("Your browser would not let us copy. Select the text and copy it.");
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => downloadText(fileBase, text)}>Download .txt</Button>
            <Button
              variant="ghost"
              className="min-h-11 w-full sm:w-auto"
              onClick={async () => {
                const { letterDocx } = await import("@/lib/export/letter");
                downloadBlob(exportFileName(resume, "docx", "Cover_letter"), await letterDocx(text));
              }}
            >
              Download Word (.docx)
            </Button>
            <Button variant="quiet" className="min-h-11 w-full sm:w-auto" onClick={() => save("")}>Clear</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
