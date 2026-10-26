"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cleanResume, validateResume } from "@/lib/clean";
import { useDraft } from "@/lib/draft";
import { PAPER_CSS } from "@/lib/paper-css";
import { SAMPLE_RESUME } from "@/lib/sample";
import { PRESETS } from "@/lib/templates";
import { LIMITS } from "@/lib/schema";
import { ResumePaper } from "../ResumePaper";
import { Button } from "../ui";
import { JdStep } from "./JdStep";
import { ProfileStep } from "./ProfileStep";

const skeleton = () => <div role="status" className="h-64 animate-pulse rounded-2xl bg-surface-2" aria-label="Loading" />;
// Heavier steps load only when reached.
const ReviewStep = dynamic(() => import("./ReviewStep").then((m) => m.ReviewStep), { loading: skeleton });
const DesignStep = dynamic(() => import("./DesignStep").then((m) => m.DesignStep), { loading: skeleton });

const STEPS = ["Profile", "Job", "Review", "Design & Export"] as const;
const LAST = STEPS.length - 1;
/** Each step has its own address (/build?step=job), so the browser's Back and Forward buttons move between steps. */
const STEP_NAMES = ["profile", "job", "review", "design"] as const;
const stepFromUrl = (): number => {
  const i = STEP_NAMES.indexOf((new URLSearchParams(window.location.search).get("step") ?? "") as (typeof STEP_NAMES)[number]);
  return i < 0 ? 0 : i;
};
const urlForStep = (i: number): string => {
  const q = new URLSearchParams(window.location.search);
  if (i === 0) q.delete("step");
  else q.set("step", STEP_NAMES[i]);
  const qs = q.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
};

export function Builder() {
  const { draft, ready, setResume, setJd, replaceResume, setTemplate, setReview, reset } = useDraft();
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0); // furthest step reached: earlier steps stay reachable after going back
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [jdError, setJdError] = useState<string>();
  const [mobilePreview, setMobilePreview] = useState(false);
  const [zoom, setZoom] = useState(100);
  const printable = useMemo(() => cleanResume(draft.resume), [draft.resume]);
  const draftRef = useRef(draft); // the Back/Forward handler must see the latest data, not the data from when it was attached
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Landing-page template cards link here with ?template=<id>. Only known preset ids are honoured.
  useEffect(() => {
    if (!ready) return;
    const id = new URLSearchParams(window.location.search).get("template");
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) setTemplate(preset.config);
  }, [ready, setTemplate]);

  /** The furthest step the saved data allows, so a reload or a shared link cannot land on a step that has nothing to show. */
  const reachable = () => {
    const { resume, jd } = draftRef.current;
    const v = validateResume(resume);
    const contactOk = v.ok || !Object.keys(v.errors).some((k) => k.startsWith("contact"));
    if (!contactOk) return 0;
    return jd.trim().length >= 40 ? LAST : 1;
  };

  /** Move to a step. `push` adds a history entry, so Back returns to the step you came from (like pages of a form). */
  function goTo(i: number, push = true) {
    const target = Math.max(0, Math.min(LAST, i));
    setStep(target);
    setMaxStep((m) => Math.max(m, target));
    if (push) window.history.pushState({ step: target }, "", urlForStep(target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Arriving on /build?step=... (a reload, or the browser's Forward button) restores that step, when the data allows it.
  useEffect(() => {
    if (!ready) return;
    const wanted = stepFromUrl();
    if (wanted > 0) {
      const t = Math.min(wanted, reachable());
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the step from the address
      setStep(t);
      setMaxStep(t);
      if (t !== wanted) window.history.replaceState({ step: t }, "", urlForStep(t));
    }
    // Back / Forward between steps of this page.
    const onPop = () => {
      const t = Math.min(stepFromUrl(), reachable());
      setStep(t);
      setMaxStep((m) => Math.max(m, t));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ready]);

  function next() {
    if (step === 0) {
      const v = validateResume(draft.resume);
      // Only the contact fields are required to move on; the rest can be refined later.
      const blocking = Object.fromEntries(Object.entries(v.ok ? {} : v.errors).filter(([k]) => k.startsWith("contact")));
      setErrors(blocking);
      if (Object.keys(blocking).length) return;
    }
    if (step === 1) {
      const len = draft.jd.trim().length;
      if (len < 40 || len > LIMITS.jd) return setJdError("Paste the job description (at least 40 characters).");
      setJdError(undefined);
    }
    goTo(step + 1);
  }

  if (!ready) return <div role="status" className="mx-auto h-96 max-w-6xl animate-pulse rounded-2xl bg-surface-2" aria-label="Loading" />;

  return (
    <>
      <style>{PAPER_CSS}</style>
      {/* Screen UI. Hidden when printing so only the resume is output. */}
      <div className="screen-only mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <nav aria-label="Progress" className="sticky top-0 z-10 -mx-4 mb-6 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Link href="/" className="font-display text-lg">TomCredora</Link>
            <ol className="flex items-center gap-1 text-sm">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <button
                    onClick={() => goTo(i)}
                    aria-current={i === step ? "step" : undefined}
                    aria-label={`Step ${i + 1}: ${s}`}
                    disabled={i > maxStep}
                    className={`rounded-full px-2.5 py-1.5 transition-colors duration-[var(--dur)] sm:px-3 ${i === step ? "bg-accent text-accent-ink" : i <= maxStep ? "text-accent hover:bg-accent-soft" : "text-ink-2"}`}
                  >
                    <span className="tabular-nums">{i + 1}</span>
                    <span className="ml-1.5 hidden md:inline">{s}</span>
                  </button>
                </li>
              ))}
            </ol>
            <span className="flex items-center gap-1">
              <Link href="/studio" className="hidden rounded-lg px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink sm:block">Workspace</Link>
              <Button variant="quiet" className="!px-2 text-xs" onClick={() => { reset(); setStep(0); setMaxStep(0); setErrors({}); window.history.replaceState({ step: 0 }, "", urlForStep(0)); }}>Clear</Button>
            </span>
          </div>
        </nav>

        <div className="mb-4 lg:hidden">
          <div role="tablist" className="grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm">
            {["Edit", "Preview"].map((t, i) => (
              <button key={t} role="tab" aria-selected={mobilePreview === (i === 1)} onClick={() => setMobilePreview(i === 1)} className={`rounded-md py-1.5 transition ${mobilePreview === (i === 1) ? "bg-surface shadow-sm" : "text-ink-2"}`}>{t}</button>
            ))}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <main id="main" className={mobilePreview ? "hidden lg:block" : ""}>
            <div key={step} className="rise">
              {step === 0 && (
                <>
                  {!draft.resume.contact.fullName && (
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
                      <span>New here? See how it works with example data.</span>
                      <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => replaceResume(SAMPLE_RESUME)}>Load example</Button>
                    </div>
                  )}
                  <ProfileStep resume={draft.resume} setResume={setResume} errors={errors} />
                </>
              )}
              {step === 1 && <JdStep jd={draft.jd} setJd={setJd} error={jdError} />}
              {step === 2 && <ReviewStep resume={draft.resume} jd={draft.jd} replaceResume={replaceResume} review={draft.review} setReview={setReview} />}
              {step === 3 && <DesignStep resume={draft.resume} config={draft.template} setConfig={setTemplate} />}
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0}>Back</Button>
              {step < LAST && <Button onClick={next}>Continue</Button>}
            </div>
          </main>

          <aside aria-label="Live preview" className={`${mobilePreview ? "" : "hidden"} lg:block`}>
            <div className="lg:sticky lg:top-20">
              <div role="group" aria-label="Preview zoom" className="mb-2 flex justify-end gap-1 text-xs">
                {[100, 140, 180].map((z) => (
                  <button key={z} onClick={() => setZoom(z)} aria-pressed={zoom === z} className={`rounded-md px-2.5 py-1 tabular-nums transition-colors duration-[var(--dur)] ${zoom === z ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>
                    {z === 100 ? "Fit" : `${z}%`}
                  </button>
                ))}
              </div>
              <div tabIndex={0} role="region" aria-label="Resume preview scroll area" className="max-h-[calc(100vh-8.5rem)] overflow-auto rounded-lg pb-4">
                <div style={{ width: `${zoom}%` }} className="transition-[width] duration-[var(--dur)] ease-[var(--ease-out)]">
                  <ResumePaper resume={draft.resume} config={draft.template} />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Print-only copy: real points, @page margins so every page is padded. */}
      {step === LAST && (
        <div className="print-only">
          <style>{`@page { size: ${draft.template.paper === "a4" ? "A4" : "letter"}; margin: ${draft.template.marginIn}in; }`}</style>
          <ResumePaper resume={printable} config={draft.template} mode="print" showGuide={false} />
        </div>
      )}
    </>
  );
}
