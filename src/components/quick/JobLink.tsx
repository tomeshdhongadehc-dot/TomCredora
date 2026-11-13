"use client";

import { useId, useState } from "react";
import { Button } from "../ui";

export interface FoundJob {
  text: string;
  title: string;
  company: string;
  url: string;
  host: string;
  via: "structured" | "page";
}

/**
 * Paste a link to a job posting and have the text read for you. The page is fetched by our server under strict
 * rules (public https pages only) and the text lands in the job description box for you to check. Many job sites
 * need a login, so a plain "paste it instead" is always on offer. Nothing is sent to the AI here.
 */
export function JobLink({ onFound }: { onFound: (j: FoundJob) => void }) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ host: string; via: "structured" | "page"; truncated: boolean } | null>(null);

  async function read() {
    setError(null);
    setDone(null);
    const link = url.trim();
    if (!/^https:\/\/\S+\.\S+/i.test(link)) return setError("Paste the full web address, starting with https://");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/job-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) return setError(j?.error?.message ?? "We could not read that link. Please paste the job description instead.");
      onFound({ text: String(j.text ?? ""), title: String(j.title ?? ""), company: String(j.company ?? ""), url: link, host: String(j.host ?? ""), via: j.via === "structured" ? "structured" : "page" });
      setDone({ host: String(j.host ?? ""), via: j.via === "structured" ? "structured" : "page", truncated: !!j.truncated });
    } catch {
      setError("Network problem. Check your connection and try again, or paste the job description instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">Or paste a link to the job</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!busy) void read();
            }
          }}
          placeholder="https://company.com/careers/frontend-engineer"
          className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-base placeholder:text-ink-2/60 hover:border-ink-2/50 focus:border-accent sm:text-sm"
        />
        <Button type="button" variant="ghost" className="min-h-11 w-full shrink-0 sm:w-auto" disabled={busy || url.trim().length < 12} aria-busy={busy} onClick={() => void read()}>
          {busy ? "Reading…" : "Read the job"}
        </Button>
      </div>
      <p className="text-xs text-ink-2">Works with many company career pages and job boards. If a site needs you to sign in, copy the text and paste it below instead.</p>
      {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      {done && (
        <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          Read the job from {done.host || "that page"}. Check the text below{done.via === "page" ? " and delete anything that is not part of the job" : ""}
          {done.truncated ? ". The page was long, so the end was cut off" : ""}.
        </p>
      )}
    </div>
  );
}
