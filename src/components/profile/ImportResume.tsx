"use client";

import { useId, useRef, useState } from "react";
import type { ImportReport } from "@/lib/import/parse";
import { Button, Textarea } from "../ui";

const MAX_BYTES = 4 * 1024 * 1024;

type View = { kind: "idle" } | { kind: "reading"; what: string } | { kind: "review"; report: ImportReport; from: string };

/**
 * Fill the profile from a resume you already have: a PDF or Word file, or pasted text. A pasted text is read
 * entirely in this browser. A file is sent to our own server only to pull the text out of it (not stored, not
 * sent to the AI), and then read here. The result is shown for checking before anything is replaced.
 */
export function ImportResume({ onUse, replacing, onDone }: { onUse: (r: ImportReport["resume"]) => void; replacing: boolean; onDone?: () => void }) {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  async function review(text: string, from: string) {
    const { parseResumeText } = await import("@/lib/import/parse");
    const report = parseResumeText(text);
    const f = report.found;
    if (!report.resume.contact.fullName && !report.resume.contact.email && f.roles + f.education + f.skills === 0) {
      setView({ kind: "idle" });
      return setError("We could not find a resume in that text. Check that it is the text of your resume, or fill your profile in by hand.");
    }
    setView({ kind: "review", report, from });
  }

  async function readFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) return setError("That file is too large. The limit is 4 MB.");
    const name = file.name.toLowerCase();
    try {
      if (/\.(txt|md|text)$/.test(name) || file.type.startsWith("text/")) {
        setView({ kind: "reading", what: file.name });
        return await review((await file.text()).slice(0, 60_000), file.name);
      }
      if (/\.doc$/.test(name)) return setError("Older .doc files are not supported. Save it as .docx or PDF and try again.");
      if (!/\.(pdf|docx)$/.test(name)) return setError("Choose a PDF or Word (.docx) file, or paste the text below.");
      setView({ kind: "reading", what: file.name });
      const res = await fetch("/api/v1/import-file", {
        method: "POST",
        headers: { "content-type": name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        body: file,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setView({ kind: "idle" });
        return setError(j?.error?.message ?? "We could not read that file. Try pasting the text instead.");
      }
      await review(String(j.text ?? ""), file.name);
    } catch {
      setView({ kind: "idle" });
      setError("Network problem. Check your connection and try again, or paste the text instead.");
    }
  }

  const reset = () => {
    setView({ kind: "idle" });
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (view.kind === "review") {
    const { report } = view;
    const r = report.resume;
    const f = report.found;
    return (
      <div className="space-y-4" aria-label="Imported details">
        <div role="status">
          <p className="font-medium">Here is what we found{view.from ? ` in ${view.from}` : ""}.</p>
          <p className="mt-1 text-sm text-ink-2">Check it, then use it. You can fix anything in your profile afterwards.</p>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl bg-surface-2 p-3 text-sm sm:grid-cols-2">
          {[
            ["Name", r.contact.fullName],
            ["Email", r.contact.email],
            ["Phone", r.contact.phone],
            ["Location", r.contact.location],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-ink-2">{k}</dt>
              <dd className={`truncate font-medium ${v ? "" : "text-warn"}`}>{v || "Not found"}</dd>
            </div>
          ))}
        </dl>
        <ul className="space-y-1.5 text-sm" aria-label="Found in the resume">
          <li><strong>{f.roles}</strong> job{f.roles === 1 ? "" : "s"}{r.experience.length > 0 && <span className="text-ink-2">: {r.experience.map((e) => [e.role, e.company].filter(Boolean).join(" at ")).slice(0, 4).join("; ")}{r.experience.length > 4 ? "…" : ""}</span>}</li>
          <li><strong>{f.education}</strong> education {f.education === 1 ? "entry" : "entries"}{r.education.length > 0 && <span className="text-ink-2">: {r.education.map((e) => e.school || e.degree).filter(Boolean).slice(0, 3).join("; ")}</span>}</li>
          <li><strong>{f.skills}</strong> skill{f.skills === 1 ? "" : "s"}</li>
          {f.projects > 0 && <li><strong>{f.projects}</strong> project{f.projects === 1 ? "" : "s"}</li>}
          {f.certifications > 0 && <li><strong>{f.certifications}</strong> certification{f.certifications === 1 ? "" : "s"}</li>}
        </ul>
        {report.notes.length > 0 && (
          <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn" role="note" aria-label="Things to check">
            <p className="font-medium">Worth a look</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {report.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {replacing && <p className="text-sm text-ink-2">This replaces the details already in your profile.</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="min-h-11 w-full sm:w-auto"
            onClick={() => {
              onUse(report.resume);
              reset();
              setPasted("");
              onDone?.();
            }}
          >
            {replacing ? "Replace my profile with this" : "Use this as my profile"}
          </Button>
          <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={reset}>Start again</Button>
        </div>
      </div>
    );
  }

  const busy = view.kind === "reading";
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void readFile(f);
        }}
        className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors sm:p-6 ${drag ? "border-accent bg-accent-soft" : "border-line"}`}
      >
        <p className="text-sm text-ink-2">Drop a PDF or Word file here, or</p>
        <input
          ref={fileRef}
          id={`${id}-file`}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
          }}
        />
        <Button type="button" className="mt-3 min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => fileRef.current?.click()} aria-busy={busy}>
          {busy ? `Reading ${view.what}…` : "Choose a file"}
        </Button>
        <p className="mt-2 text-xs text-ink-2">PDF, Word (.docx) or text, up to 4 MB. Only the text is read. Nothing is kept.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-paste`} className="block text-sm font-medium">Or paste the text of your resume</label>
        <Textarea id={`${id}-paste`} rows={6} maxLength={60_000} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Open your resume, select all, copy, and paste it here" className="text-base sm:text-sm" />
        <p className="text-xs text-ink-2">Pasted text is read in this browser and goes nowhere.</p>
      </div>
      <Button type="button" variant="ghost" className="min-h-11 w-full sm:w-auto" disabled={busy || pasted.trim().length < 20} onClick={() => void review(pasted, "")}>
        Read my resume
      </Button>
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>
      )}
    </div>
  );
}
