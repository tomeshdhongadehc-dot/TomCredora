"use client";

import { useEffect, useId, useRef, useState } from "react";
import { downloadText } from "@/lib/export/files";
import { MAX_RESUMES, type ImportResult, type ResumeMeta } from "@/lib/workspace";
import { Button } from "../ui";

export interface ResumesApi {
  resumes: ResumeMeta[];
  activeId: string;
  switchTo: (id: string) => void;
  create: (name: string, kind?: "blank" | "example" | "profile") => boolean;
  /** is there a saved profile to start a resume from? */
  profileAvailable: () => boolean;
  duplicate: (id: string) => boolean;
  rename: (id: string, name: string) => void;
  remove: (id: string) => boolean;
  importText: (text: string, fileName?: string) => ImportResult;
  exportText: () => string;
}

const when = (t: number) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never edited");
const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "resume";

/** "My resumes": switch, create, duplicate, rename, delete, import and export. A native <dialog>, so focus and Esc just work. */
export function ResumesDialog({ open, onClose, api }: { open: boolean; onClose: () => void; api: ResumesApi }) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [newName, setNewName] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const full = api.resumes.length >= MAX_RESUMES;
  const say = (kind: "ok" | "error", text: string) => setMessage({ kind, text });

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const r = api.importText(text, file.name);
    if (r.ok) {
      say("ok", `Imported "${r.name}".`);
      onClose();
    } else say("error", r.error);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby={`${uid}-t`}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id={`${uid}-t`} className="font-display text-xl">
          My resumes
        </h2>
        <Button variant="quiet" className="!px-2" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>

      <ul aria-label="Your resumes" className="max-h-[50vh] divide-y divide-line overflow-auto">
        {api.resumes.map((r) => {
          const active = r.id === api.activeId;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
              <div className="min-w-0 flex-1">
                <input
                  aria-label={`Rename ${r.name}`}
                  defaultValue={r.name}
                  maxLength={60}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && api.rename(r.id, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium hover:border-line focus:border-accent"
                />
                <p className="px-1.5 text-xs text-ink-2">
                  {active ? "Open now · " : ""}Edited {when(r.updatedAt)}
                </p>
              </div>
              {confirming === r.id ? (
                <span className="flex items-center gap-1 text-sm">
                  Delete?
                  <Button variant="ghost" className="!px-2 !py-1 text-xs text-bad" onClick={() => { api.remove(r.id); setConfirming(null); }}>
                    Yes, delete {r.name}
                  </Button>
                  <Button variant="quiet" className="!px-2 !py-1 text-xs" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Button variant={active ? "quiet" : "ghost"} className="!px-3 !py-1 text-xs" disabled={active} onClick={() => { api.switchTo(r.id); onClose(); }} aria-label={`Open ${r.name}`}>
                    {active ? "Current" : "Open"}
                  </Button>
                  <Button variant="quiet" className="!px-2 !py-1 text-xs" disabled={full} onClick={() => { if (api.duplicate(r.id)) onClose(); }} aria-label={`Duplicate ${r.name}`}>
                    Duplicate
                  </Button>
                  <Button variant="quiet" className="!px-2 !py-1 text-xs text-bad" disabled={api.resumes.length <= 1} onClick={() => setConfirming(r.id)} aria-label={`Delete ${r.name}`}>
                    Delete
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-3 border-t border-line px-5 py-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (api.create(newName || "Untitled resume", "blank")) { setNewName(""); onClose(); }
          }}
        >
          <div className="min-w-44 flex-1">
            <label htmlFor={`${uid}-n`} className="mb-1 block text-xs text-ink-2">
              New resume name
            </label>
            <input id={`${uid}-n`} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="e.g. Product manager, Google" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
          </div>
          <Button type="submit" disabled={full}>
            New blank resume
          </Button>
          <Button type="button" variant="ghost" disabled={full} onClick={() => { if (api.create(newName || "Example resume", "example")) { setNewName(""); onClose(); } }}>
            New from example
          </Button>
          {open && api.profileAvailable() && (
            <Button type="button" variant="ghost" disabled={full} onClick={() => { if (api.create(newName || "From my profile", "profile")) { setNewName(""); onClose(); } }}>
              New from my profile
            </Button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
            Import a .json backup
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <Button variant="ghost" onClick={() => downloadText(`${fileSafe(api.resumes.find((r) => r.id === api.activeId)?.name ?? "resume")}.json`, api.exportText(), "application/json")}>
            Export this resume (.json)
          </Button>
          <span className="text-xs text-ink-2">
            {api.resumes.length}/{MAX_RESUMES} saved in this browser
          </span>
        </div>
        <p role={message?.kind === "error" ? "alert" : "status"} aria-live="polite" className={`min-h-5 text-sm ${message?.kind === "error" ? "text-bad" : "text-accent"}`}>
          {message?.text ?? ""}
        </p>
      </div>
    </dialog>
  );
}
