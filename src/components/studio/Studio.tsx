"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cleanResume } from "@/lib/clean";
import { useDraft } from "@/lib/draft";
import { PAPER_CSS } from "@/lib/paper-css";
import { SAMPLE_RESUME } from "@/lib/sample";
import { hasContent } from "@/lib/draft-model";
import { ResumePaper } from "../ResumePaper";
import { Button } from "../ui";
import { JdStep } from "../builder/JdStep";
import { AccountMenu } from "../account/AccountMenu";
import { BrowserOnlyNote } from "../account/SaveNudge";
import { ResumesDialog } from "./ResumesDialog";
import { SectionsEditor } from "./SectionsEditor";

const skeleton = () => <div role="status" className="h-48 animate-pulse rounded-2xl bg-surface-2" aria-label="Loading" />;
const DesignStep = dynamic(() => import("../builder/DesignStep").then((m) => m.DesignStep), { loading: skeleton });
const ReviewStep = dynamic(() => import("../builder/ReviewStep").then((m) => m.ReviewStep), { loading: skeleton });

type Tab = "templates" | "style" | "job" | "export";
const TABS: { id: Tab; label: string }[] = [
  { id: "templates", label: "Templates" },
  { id: "style", label: "Style & layout" },
  { id: "job", label: "Job & AI" },
  { id: "export", label: "Export" },
];
type View = "content" | "preview" | "design";
const ZOOMS = [{ v: 0, t: "Fit" }, { v: 125, t: "125%" }, { v: 160, t: "160%" }, { v: 220, t: "220%" }] as const;

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/**
 * The workspace: edit every section on the left, see the live resume in the middle, and design, tailor and
 * export on the right. Shares its data with the guided mode, so you can move between the two freely.
 */
export function Studio() {
  const { draft, ready, setResume, setJd, replaceResume, setTemplate, setReview, history, workspace } = useDraft();
  const [tab, setTab] = useState<Tab>("templates");
  const [view, setView] = useState<View>("content");
  const [zoom, setZoom] = useState<number>(0);
  const [resumesOpen, setResumesOpen] = useState(false);
  // Not deferred: a deferred print copy can lag one edit behind, and printing right after typing then misses it.
  const printable = useMemo(() => cleanResume(draft.resume), [draft.resume]);
  const empty = !hasContent(draft.resume);

  // Undo / redo shortcuts. Inside a text field the browser's own undo applies, so we leave it alone there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); history.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  if (!ready) return <div role="status" className="mx-auto mt-20 h-96 max-w-5xl animate-pulse rounded-2xl bg-surface-2" aria-label="Loading workspace" />;

  const paperWidth = zoom === 0 ? "100%" : `${zoom}%`;
  const showView = (v: View) => (view === v ? "" : "hidden xl:block");

  return (
    <>
      <style>{PAPER_CSS}</style>
      <div className="screen-only flex h-dvh flex-col">
        {/* ---------- Header ---------- */}
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-bg/90 px-3 py-2 backdrop-blur sm:px-4">
          <Link href="/" className="mr-1 font-display text-lg">
            TomCredora
          </Link>
          <button
            type="button"
            onClick={() => setResumesOpen(true)}
            aria-haspopup="dialog"
            aria-label={`My resumes. Current: ${workspace.activeName}`}
            className="flex min-w-0 max-w-[8.5rem] items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 sm:max-w-[14rem]"
          >
            <span className="truncate font-medium">{workspace.activeName || "Resume"}</span>
            <span aria-hidden className="text-ink-2">⌄</span>
          </button>
          <div className="ml-1 flex items-center gap-1" role="group" aria-label="History">
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z outside text fields)">
              ↶<span className="hidden sm:inline"> Undo</span>
            </Button>
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              <span className="hidden sm:inline">Redo </span>↷
            </Button>
          </div>
          <span className="hidden flex-1 text-right text-xs text-ink-2 md:block" role="status">
            Saved in this browser
          </span>
          <Link href="/profile" className="ml-auto hidden rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink sm:block sm:px-3 md:ml-0">
            My profile
          </Link>
          <Link href="/quick" className="hidden rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink sm:block sm:px-3">
            Quick resume
          </Link>
          <Link href="/build" className="ml-auto rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink sm:ml-0 sm:px-3">
            Guided mode
          </Link>
          <AccountMenu className="!px-2 sm:!px-3" />
        </header>

        {/* below the wide layout the three panes become a view switcher */}
        <div role="tablist" aria-label="Workspace view" className="grid grid-cols-3 gap-1 border-b border-line bg-surface-2 p-1 text-sm xl:hidden">
          {([["content", "Content"], ["preview", "Preview"], ["design", "Design"]] as const).map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md py-1.5 transition ${view === v ? "bg-surface font-medium shadow-sm" : "text-ink-2"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(340px,430px)_minmax(0,1fr)_minmax(340px,440px)]">
          {/* ---------- Left: content ---------- */}
          <motion.aside layoutScroll aria-label="Resume content" className={`min-h-0 overflow-y-auto border-r border-line p-3 sm:p-4 ${showView("content")}`}>
            {empty && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
                <span>New here? Fill in the sections below, or start from an example.</span>
                <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => replaceResume(SAMPLE_RESUME)}>
                  Load example
                </Button>
              </div>
            )}
            <BrowserOnlyNote className="mb-3" />
            <SectionsEditor resume={draft.resume} setResume={setResume} />
          </motion.aside>

          {/* ---------- Centre: live resume ---------- */}
          <main id="main" aria-label="Resume preview" className={`flex min-h-0 flex-col bg-surface-2/60 ${showView("preview")}`}>
            <div role="group" aria-label="Zoom" className="flex items-center justify-center gap-1 border-b border-line px-3 py-2 text-xs">
              {ZOOMS.map((z) => (
                <button key={z.v} onClick={() => setZoom(z.v)} aria-pressed={zoom === z.v} className={`rounded-md px-3 py-1 tabular-nums transition-colors ${zoom === z.v ? "bg-accent text-accent-ink" : "bg-surface text-ink-2 hover:text-ink"}`}>
                  {z.t}
                </button>
              ))}
            </div>
            <div tabIndex={0} role="region" aria-label="Resume preview scroll area" className="min-h-0 flex-1 overflow-auto p-4 sm:p-8">
              <div style={{ width: paperWidth, maxWidth: zoom === 0 ? "52rem" : undefined }} className="mx-auto transition-[width] duration-[var(--dur)] ease-[var(--ease-out)]">
                <ResumePaper resume={draft.resume} config={draft.template} />
              </div>
            </div>
          </main>

          {/* ---------- Right: design, job, export ---------- */}
          <aside aria-label="Design and export" className={`flex min-h-0 flex-col border-l border-line ${showView("design")}`}>
            <div role="tablist" aria-label="Design tools" className="flex flex-wrap gap-1 border-b border-line p-2 text-sm">
              {TABS.map((t) => (
                <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1.5 transition ${tab === t.id ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <motion.div layoutScroll role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {tab === "templates" && <DesignStep resume={draft.resume} config={draft.template} setConfig={setTemplate} parts={["templates"]} />}
              {tab === "style" && <DesignStep resume={draft.resume} config={draft.template} setConfig={setTemplate} parts={["style"]} />}
              {tab === "export" && <DesignStep resume={draft.resume} config={draft.template} setConfig={setTemplate} parts={["export"]} />}
              {tab === "job" && (
                <div className="space-y-5">
                  <JdStep jd={draft.jd} setJd={setJd} />
                  <ReviewStep resume={draft.resume} jd={draft.jd} replaceResume={replaceResume} review={draft.review} setReview={setReview} />
                </div>
              )}
            </motion.div>
          </aside>
        </div>
      </div>

      <ResumesDialog open={resumesOpen} onClose={() => setResumesOpen(false)} api={workspace} />

      {/* Print-only copy (real points, @page margins). Deferred so typing stays smooth. */}
      <div className="print-only">
        <style>{`@page { size: ${draft.template.paper === "a4" ? "A4" : "letter"}; margin: ${draft.template.marginIn}in; }`}</style>
        <ResumePaper resume={printable} config={draft.template} mode="print" showGuide={false} />
      </div>
    </>
  );
}
