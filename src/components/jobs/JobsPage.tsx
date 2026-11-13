"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getStorage } from "@/lib/draft";
import { JOB_STATUSES, STATUS_LABEL, jobName, type JobStatus } from "@/lib/job-model";
import { clearJob, countByStatus, deleteJob, listJobs, openJob, updateJob, type JobRow } from "@/lib/jobs";
import { onSynced } from "@/lib/sync/bus";
import { AccountMenu } from "../account/AccountMenu";
import { Button, Card } from "../ui";

const TONE: Record<JobStatus, string> = {
  saved: "bg-surface-2 text-ink-2",
  applied: "bg-accent-soft text-accent",
  interview: "bg-warn-soft text-warn",
  offer: "bg-accent text-accent-ink",
  rejected: "bg-surface-2 text-ink-2 line-through decoration-1",
};

const when = (t: number) => (t > 0 ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Every resume made for a job, with where each application stands. It reads the same saved data as the rest of the
 * app (and so syncs with the account) and changes only the job details, never the resume.
 */
export function JobsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => setRows(listJobs(getStorage())), []);
  useEffect(() => {
    reload();
    const off = onSynced(reload);
    window.addEventListener("storage", reload);
    return () => {
      off();
      window.removeEventListener("storage", reload);
    };
  }, [reload]);

  const counts = useMemo(() => countByStatus(rows ?? []), [rows]);
  const shown = (rows ?? []).filter((r) => filter === "all" || r.job.status === filter);

  const change = (id: string, patch: Parameters<typeof updateJob>[2]) => {
    updateJob(getStorage(), id, patch);
    reload();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="font-display text-lg">TomCredora</Link>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">Applications</span>
        <nav aria-label="Other modes" className="ml-auto flex flex-wrap gap-1 text-sm">
          <Link href="/quick" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Quick resume</Link>
          <Link href="/profile" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">My profile</Link>
          <Link href="/studio" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Workspace</Link>
          <AccountMenu />
        </nav>
      </header>

      <main id="main" className="space-y-5">
        <div>
          <h1 className="font-display text-3xl">Your applications</h1>
          <p className="mt-1 text-ink-2">Every resume you make for a job is kept here, so you can see where each one stands and open the exact resume you sent.</p>
        </div>

        {rows === null ? (
          <div role="status" aria-label="Loading" className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        ) : rows.length === 0 ? (
          <Card>
            <h2 className="font-display text-xl">Nothing here yet</h2>
            <p className="mt-2 text-sm text-ink-2">When you make a resume for a job in Quick resume, it is saved here. Then you can mark it Applied, Interview or Offer, and add notes.</p>
            <Link href="/quick" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink shadow-sm hover:brightness-110 sm:w-auto">Make a resume for a job</Link>
          </Card>
        ) : (
          <>
            <div role="group" aria-label="Show applications by stage" className="flex flex-wrap gap-2">
              {(["all", ...JOB_STATUSES] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filter === s}
                  onClick={() => setFilter(s)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium transition sm:min-h-9 sm:px-3 ${filter === s ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-ink-2 hover:bg-surface-2"}`}
                >
                  {s === "all" ? "All" : STATUS_LABEL[s]} <span className="tabular-nums">{counts[s]}</span>
                </button>
              ))}
            </div>

            {message && <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{message}</p>}

            {shown.length === 0 ? (
              <p className="text-sm text-ink-2">No applications at this stage.</p>
            ) : (
              <ul className="space-y-3" aria-label="Applications">
                {shown.map((r) => (
                  <li key={r.id}>
                    <Card className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="break-words font-display text-xl">{r.job.title || "Untitled job"}</h2>
                          <p className="break-words text-sm text-ink-2">{[r.job.company, `Saved ${when(r.job.createdAt || r.updatedAt)}`, r.job.appliedAt ? `Applied ${when(r.job.appliedAt)}` : ""].filter(Boolean).join(" · ")}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${TONE[r.job.status]}`}>{STATUS_LABEL[r.job.status]}</span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label htmlFor={`st-${r.id}`} className="block text-sm font-medium">Stage</label>
                          <select
                            id={`st-${r.id}`}
                            value={r.job.status}
                            onChange={(e) => change(r.id, { status: e.target.value as JobStatus })}
                            className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-base sm:min-h-0 sm:text-sm"
                          >
                            {JOB_STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor={`nt-${r.id}`} className="block text-sm font-medium">Notes</label>
                          <textarea
                            id={`nt-${r.id}`}
                            defaultValue={r.job.note}
                            maxLength={500}
                            rows={2}
                            placeholder="Who to call, when to follow up…"
                            onBlur={(e) => e.target.value !== r.job.note && change(r.id, { note: e.target.value })}
                            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-base sm:text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          className="min-h-11 w-full sm:w-auto"
                          onClick={() => {
                            if (openJob(getStorage(), r.id)) router.push("/studio");
                          }}
                        >
                          Open this resume
                        </Button>
                        {r.job.url && (
                          <a href={r.job.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-2 sm:w-auto">
                            Job posting<span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          className="min-h-11 w-full sm:w-auto"
                          aria-label={`Stop tracking ${jobName(r.job)} and keep the resume`}
                          onClick={() => {
                            clearJob(getStorage(), r.id);
                            setMessage("Removed from your applications. The resume is still in your workspace.");
                            reload();
                          }}
                        >
                          Stop tracking
                        </Button>
                        {confirming === r.id ? (
                          <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label={`Delete ${jobName(r.job)}?`}>
                            <Button
                              variant="ghost"
                              className="min-h-11 w-full border-bad text-bad sm:w-auto"
                              onClick={() => {
                                const ok = deleteJob(getStorage(), r.id);
                                setConfirming(null);
                                setMessage(ok ? "Deleted." : "That is your only resume, so it cannot be deleted. Use Stop tracking instead.");
                                reload();
                              }}
                            >
                              Yes, delete the resume
                            </Button>
                            <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => setConfirming(null)}>Keep it</Button>
                          </div>
                        ) : (
                          <Button variant="quiet" className="min-h-11 w-full text-bad sm:w-auto" aria-label={`Delete ${jobName(r.job)}`} onClick={() => setConfirming(r.id)}>Delete</Button>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
