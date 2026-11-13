"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cleanResume, validateResume } from "@/lib/clean";
import { useDraft } from "@/lib/draft";
import { hasContent } from "@/lib/draft-model";
import { MAX_VERSIONS, STATUS_LABEL, guessJobTitle, jdFingerprint, jobName } from "@/lib/job-model";
import { PAPER_CSS } from "@/lib/paper-css";
import { completeness, profileFromResume, profileHasContent } from "@/lib/profile";
import { LIMITS } from "@/lib/schema";
import { SAMPLE_RESUME } from "@/lib/sample";
import { addSkill, alignSkillsToJd, removeSkill } from "@/lib/skill-gap";
import { useGeminiKey, useTailor } from "@/lib/tailor-client";
import { PRESETS, presetById } from "@/lib/templates";
import { useProfile } from "@/lib/use-profile";
import { ResumePaper } from "../ResumePaper";
import { Button, Card, Field, Input, Textarea } from "../ui";
import { AccountMenu } from "../account/AccountMenu";
import { SaveNudge } from "../account/SaveNudge";
import { JobLink } from "./JobLink";
import { SkillGapPanel } from "./SkillGapPanel";

const skeleton = () => <div role="status" className="h-32 animate-pulse rounded-2xl bg-surface-2" aria-label="Loading" />;
const DesignStep = dynamic(() => import("../builder/DesignStep").then((m) => m.DesignStep), { loading: skeleton });
const PageFit = dynamic(() => import("./PageFit").then((m) => m.PageFit));
const BulletPolish = dynamic(() => import("./BulletPolish").then((m) => m.BulletPolish), { loading: skeleton });
const CoverLetter = dynamic(() => import("./CoverLetter").then((m) => m.CoverLetter), { loading: skeleton });
const ImportResume = dynamic(() => import("../profile/ImportResume").then((m) => m.ImportResume), { loading: skeleton });
const ReviewStep = dynamic(() => import("../builder/ReviewStep").then((m) => m.ReviewStep), { loading: skeleton });

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <Card>
    <h2 className="flex items-center gap-3 font-display text-xl">
      <span aria-hidden className="grid size-7 place-items-center rounded-full bg-accent text-sm text-accent-ink">{n}</span>
      {title}
    </h2>
    <div className="mt-4">{children}</div>
  </Card>
);

/**
 * One screen from your saved profile to a finished resume: the profile (kept on its own page and never rewritten
 * here), the job description, a template, a confirmation of what is sent, then a single button. The tailored
 * result is saved into the active resume, so the workspace can fine-tune it.
 */
export function QuickResume() {
  const { draft, ready, setJd, replaceResume, setTemplate, setReview, setJob, setVersions, setLetter, workspace } = useDraft();
  const { profile, ready: profileReady, update: updateProfile } = useProfile();
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [took, setTook] = useState<number | null>(null);
  const { apiKey, saveKey } = useGeminiKey();
  const tailor = useTailor(apiKey);
  const resultRef = useRef<HTMLDivElement>(null);

  // The details that are sent come from the PROFILE; the active resume only receives the result.
  const cleaned = useMemo(() => cleanResume(profile.resume), [profile.resume]);
  // Not deferred: a deferred print copy can lag one edit behind (see Studio).
  const printable = useMemo(() => cleanResume(draft.resume), [draft.resume]);
  const present = profileHasContent(profile);
  const strength = useMemo(() => completeness(profile), [profile]);
  const validation = useMemo(() => validateResume(profile.resume), [profile.resume]);
  // The confirmation belongs to these exact details: change one and it must be given again.
  const fingerprint = useMemo(() => JSON.stringify(cleaned), [cleaned]);
  const confirmed = confirmedFor === fingerprint;
  const jdOk = draft.jd.trim().length >= 40;
  const ready2go = present && validation.ok && jdOk && confirmed && !busy;
  const skillCount = cleaned.skills.reduce((n, g) => n + g.items.length, 0);

  // a running clock while the AI works, so a ten-second wait does not feel like a hang
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  async function create() {
    setError(null);
    setTook(null);
    setSeconds(0);
    setBusy(true);
    const t0 = Date.now();
    const r = await tailor(profile.resume, draft.jd);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    // Skills the user has that the job wants go first, in the job's wording; nothing they lack is added.
    const jd = draft.jd;
    const aligned = alignSkillsToJd(r.resume, jd);
    const title = (jobTitle.trim() || guessJobTitle(jd)).slice(0, 100);
    const company = jobCompany.trim().slice(0, 100);
    const fp = jdFingerprint(jd);
    const earlier = draft.job !== null || draft.review !== null;
    const sameJob = draft.job !== null && draft.job.fp === fp;
    const before = { resume: draft.resume, job: draft.job, template: draft.template };
    if (earlier && !sameJob) {
      // A different job: keep the earlier resume and make this one its own.
      if (!workspace.create(jobName({ title, company }), "profile")) {
        setError("You have 20 saved resumes, which is the limit. Open Applications and delete one you no longer need.");
        return;
      }
      setJd(jd);
      setTemplate(before.template);
    } else if (!earlier && /^(?:untitled resume|my resume)/i.test(workspace.activeName) && (title || company)) {
      workspace.rename(workspace.activeId, jobName({ title, company }));
    }
    replaceResume(aligned);
    setReview(() => r.review);
    // Made again for the same job: the earlier version stays available.
    if (sameJob) setVersions((v) => [{ at: Date.now(), label: "Earlier version", resume: before.resume }, ...v].slice(0, MAX_VERSIONS));
    setJob((prev) => {
      const keep = sameJob && prev ? prev : null;
      return { title, company, url: jobUrl, status: keep?.status ?? "saved", note: keep?.note ?? "", createdAt: keep?.createdAt ?? Date.now(), appliedAt: keep?.appliedAt ?? null, fp };
    });
    setTook(Math.round((Date.now() - t0) / 1000));
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  if (!ready || !profileReady) return <div role="status" className="mx-auto mt-20 h-96 max-w-3xl animate-pulse rounded-2xl bg-surface-2" aria-label="Loading" />;

  const facts = [
    ["Name", cleaned.contact.fullName],
    ["Email", cleaned.contact.email],
    ["Roles", `${cleaned.experience.length}`],
    ["Education", `${cleaned.education.length}`],
    ["Skills", `${skillCount}`],
    ["Projects", `${cleaned.projects.length}`],
  ] as const;
  const inPresets = PRESETS.some((p) => p.id === draft.template.id);
  const why = !present ? "Create your profile first." : !validation.ok ? "Finish your profile first (a name and a valid email)." : !jdOk ? "Paste the job description (at least a few lines)." : !confirmed ? "Confirm your details to continue." : "";
  const canAdopt = !present && hasContent(draft.resume);

  return (
    <>
      <style>{PAPER_CSS}</style>
      <div className="screen-only mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/" className="font-display text-lg">TomCredora</Link>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">Quick resume</span>
          <nav aria-label="Other modes" className="ml-auto flex flex-wrap gap-1 text-sm">
            <Link href="/profile" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">My profile</Link>
            <Link href="/studio" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Workspace</Link>
            <Link href="/jobs" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Applications</Link>
            <AccountMenu />
          </nav>
        </header>
        <main id="main" className="space-y-5">

        <div>
          <h1 className="font-display text-3xl">A tailored resume in under a minute</h1>
          <p className="mt-1 text-ink-2">Your profile is filled once. Paste a job, confirm, and get a one-page, ATS-friendly resume.</p>
        </div>

        {/* 1 ---- profile */}
        <Step n={1} title="Your profile">
          {!present ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-2">No profile yet. It takes a couple of minutes, mostly tapping, and you do it once.</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/profile" className="inline-flex items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink shadow-sm hover:brightness-110">Create my profile</Link>
                <Button variant="ghost" aria-expanded={importing} onClick={() => setImporting((v) => !v)}>Import my resume</Button>
                <Button variant="ghost" onClick={() => updateProfile(() => profileFromResume(SAMPLE_RESUME, "software"))}>Load example profile</Button>
                {canAdopt && <Button variant="ghost" onClick={() => updateProfile(() => profileFromResume(draft.resume))}>Use my current resume&apos;s details</Button>}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm" aria-label="Profile summary">
                <strong>{cleaned.contact.fullName || "Unnamed"}</strong>
                <span className="text-ink-2"> · {cleaned.experience.length} role{cleaned.experience.length === 1 ? "" : "s"} · {cleaned.education.length} education · {skillCount} skills · profile {strength.pct}% complete</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" className="px-3 py-1.5 text-xs" aria-expanded={importing} onClick={() => setImporting((v) => !v)}>Import a resume</Button>
                <Link href="/profile" className="inline-flex items-center rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2">Edit profile</Link>
              </div>
            </div>
          )}
          {imported && !importing && (
            <p role="status" className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              Imported. Check the details in <Link href="/profile" className="underline">your profile</Link>, then add the job below.
            </p>
          )}
          {importing && (
            <div className="mt-4 border-t border-line pt-4">
              <ImportResume
                replacing={present}
                onUse={(resume) => updateProfile((p) => profileFromResume(resume, p.focus))}
                onDone={() => {
                  setImporting(false);
                  setImported(true);
                }}
              />
            </div>
          )}
        </Step>

        {/* 2 ---- job */}
        <Step n={2} title="Job description">
          <JobLink
            onFound={(j) => {
              setJd(j.text.slice(0, LIMITS.jd));
              setJobTitle(j.title ? j.title.slice(0, 100) : guessJobTitle(j.text));
              if (j.company) setJobCompany(j.company);
              setJobUrl(j.url);
            }}
          />
          <div className="mt-4" />
          <Field label="Paste the job description" htmlFor="quick-jd" hint={`${draft.jd.length.toLocaleString()} / ${LIMITS.jd.toLocaleString()} characters`}>
            <Textarea id="quick-jd" rows={8} value={draft.jd} maxLength={LIMITS.jd} onChange={(e) => setJd(e.target.value)} placeholder="About the role, responsibilities, requirements..." />
          </Field>
          {draft.job && jdFingerprint(draft.jd) !== draft.job.fp && (
            <p role="status" className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              This is a different job from the resume below. When you press Create it is saved as a new resume, so the earlier one stays.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Job title (optional)" htmlFor="quick-job-title" hint="Names the saved resume.">
              <Input id="quick-job-title" value={jobTitle} maxLength={100} onChange={(e) => setJobTitle(e.target.value)} placeholder={guessJobTitle(draft.jd) || "Senior Frontend Engineer"} className="min-h-11 text-base sm:min-h-0 sm:text-sm" />
            </Field>
            <Field label="Company (optional)" htmlFor="quick-job-company" hint="Used in file names and the cover letter.">
              <Input id="quick-job-company" value={jobCompany} maxLength={100} onChange={(e) => setJobCompany(e.target.value)} placeholder="Acme Corp" className="min-h-11 text-base sm:min-h-0 sm:text-sm" />
            </Field>
          </div>
          <SkillGapPanel
            jd={draft.jd}
            resume={profile.resume}
            onAdd={(s) => updateProfile((p) => ({ ...p, resume: addSkill(p.resume, s) }))}
            onRemove={(s) => updateProfile((p) => ({ ...p, resume: removeSkill(p.resume, s) }))}
          />
        </Step>

        {/* 3 ---- template */}
        <Step n={3} title="Template">
          <Field label="Template" htmlFor="quick-template" hint="Optional. Classic is used if you do not pick one. You can change it after.">
            <select
              id="quick-template"
              value={inPresets ? draft.template.id : "custom"}
              onChange={(e) => setTemplate(presetById(e.target.value).config)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            >
              {!inPresets && <option value="custom">My template (current)</option>}
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.tags.join(", ")}</option>
              ))}
            </select>
          </Field>
        </Step>

        {/* 4 ---- confirm + go */}
        <Step n={4} title="Confirm and create">
          <p className="text-sm text-ink-2">Only these details and the job description are sent to Gemini. Your profile is never changed. Nothing is invented: anything the AI adds that is not in your profile is flagged for you to confirm.</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-surface-2 p-3 text-sm sm:grid-cols-3" aria-label="Details to send">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-ink-2">{k}</dt>
                <dd className="truncate font-medium">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {!validation.ok && present && (
            <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              {Object.values(validation.errors).slice(0, 2).join("; ")}. <Link href="/profile" className="underline">Fix it in your profile</Link>.
            </p>
          )}
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmedFor(e.target.checked ? fingerprint : null)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>These details are accurate. Send them with the job description to Gemini.</span>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={create} disabled={!ready2go} aria-busy={busy}>
              {busy ? `Creating… ${seconds}s` : draft.review ? "Create again" : "Create my resume"}
            </Button>
            {!ready2go && !busy && why && <span className="text-xs text-ink-2">{why}</span>}
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer py-2 text-ink-2 hover:text-ink">Use your own Gemini key (free)</summary>
            <div className="mt-2 space-y-1.5">
              <label htmlFor="quick-key" className="block text-xs text-ink-2">
                Get a free key at aistudio.google.com/apikey. It stays in this tab only and is sent only to this app&apos;s server to make your request.
              </label>
              <input id="quick-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => saveKey(e.target.value)} placeholder="Paste your Gemini API key" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            </div>
          </details>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>
          )}
        </Step>

        {/* result */}
        {draft.review && (
          <div ref={resultRef} className="rise space-y-5" aria-label="Your resume">
            <SaveNudge kind="done" />
            <Card>
              <h2 className="font-display text-xl">Your resume{took !== null && <span className="ml-2 text-sm font-normal text-ink-2" role="status">ready in {took}s</span>}</h2>
              <div className="mt-4 rounded-xl bg-surface-2/60 p-3 sm:p-5">
                <div className="mx-auto max-w-[40rem]">
                  <ResumePaper resume={draft.resume} config={draft.template} showGuide={false} />
                </div>
              </div>
              <PageFit
                resume={draft.resume}
                config={draft.template}
                jd={draft.jd}
                onApply={(r, c) => {
                  replaceResume(r);
                  setTemplate(c);
                }}
              />
            </Card>
            {draft.job && (
              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Saved application">
                <p className="min-w-0 break-words text-sm" role="status">
                  Saved to your applications as <strong>{jobName(draft.job)}</strong> <span className="text-ink-2">({STATUS_LABEL[draft.job.status]})</span>.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {draft.job.status === "saved" && (
                    <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => setJob((j) => (j ? { ...j, status: "applied", appliedAt: j.appliedAt ?? Date.now() } : j))}>Mark as applied</Button>
                  )}
                  <Link href="/jobs" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-2 sm:w-auto">See all applications</Link>
                </div>
              </div>
            )}
            <DesignStep resume={draft.resume} config={draft.template} setConfig={setTemplate} parts={["export"]} />
            <BulletPolish resume={draft.resume} jd={draft.jd} apiKey={apiKey} onChange={replaceResume} />
            <CoverLetter resume={printable} jd={draft.jd} company={draft.job?.company || jobCompany} apiKey={apiKey} saved={draft.letter} onSave={setLetter} />
            <details open={draft.review.ledger.some((l) => l.status === "needs-confirmation")} className="rounded-2xl border border-line bg-surface p-5">
              <summary className="cursor-pointer py-2 font-medium">Check the AI’s wording, keywords and ATS score</summary>
              <div className="mt-4">
                <ReviewStep resume={draft.resume} jd={draft.jd} replaceResume={replaceResume} review={draft.review} setReview={setReview} />
              </div>
            </details>
            {draft.versions.length > 0 && (
              <Card>
                <h2 className="font-display text-xl">Earlier versions</h2>
                <p className="mt-1 text-sm text-ink-2">Each time you make this resume again for the same job, the one before it is kept here.</p>
                <ul className="mt-3 space-y-2" aria-label="Earlier versions">
                  {draft.versions.map((v, i) => (
                    <li key={`${v.at}-${i}`} className="flex flex-col gap-2 rounded-lg bg-surface-2/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0 text-sm">
                        <strong>{v.label}</strong> <span className="text-ink-2">· {v.at ? new Date(v.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""} · {v.resume.experience.reduce((n, e) => n + e.bullets.length, 0)} points</span>
                      </span>
                      <Button
                        variant="ghost"
                        className="min-h-11 w-full sm:w-auto"
                        onClick={() => {
                          const now = { at: Date.now(), label: "Before you restored", resume: draft.resume };
                          setVersions((list) => [now, ...list.filter((_, j) => j !== i)].slice(0, MAX_VERSIONS));
                          replaceResume(v.resume);
                        }}
                      >
                        Restore this version
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                variant="ghost"
                className="min-h-11 w-full sm:w-auto"
                onClick={() => {
                  if (workspace.create("New job", "profile")) {
                    setJobTitle("");
                    setJobCompany("");
                    setJobUrl("");
                    setTook(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  } else setError("You have 20 saved resumes, which is the limit. Open Applications and delete one you no longer need.");
                }}
              >
                Start another job
              </Button>
            </div>
            <p className="text-center text-sm text-ink-2">
              Want to fine-tune it? <Link href="/studio" className="text-accent underline-offset-4 hover:underline">Open it in the workspace</Link>.
            </p>
          </div>
        )}
        </main>
      </div>

      {/* Print-only copy (real points, @page margins) so "Download PDF" prints just the resume. */}
      <div className="print-only">
        <style>{`@page { size: ${draft.template.paper === "a4" ? "A4" : "letter"}; margin: ${draft.template.marginIn}in; }`}</style>
        <ResumePaper resume={printable} config={draft.template} mode="print" showGuide={false} />
      </div>
    </>
  );
}
