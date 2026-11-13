"use client";

import { useMemo, useState } from "react";
import { callAi } from "@/lib/ai-client";
import type { BulletMode, BulletResult } from "@/lib/ai/polish";
import type { Resume } from "@/lib/schema";
import { skillGap } from "@/lib/skill-gap";
import { Button, Card } from "../ui";

type State =
  | { s: "busy"; mode: BulletMode }
  | { s: "proposal"; mode: BulletMode; keyword?: string; text: string; novel: string[] }
  | { s: "editing"; text: string }
  | { s: "keywords" }
  | { s: "error"; message: string };

const key = (roleId: string, i: number) => `${roleId}:${i}`;
const short = (t: string) => (t.length > 40 ? `${t.slice(0, 40)}…` : t);

/**
 * Work on one point at a time: shorter, a stronger opening verb, or one of the job's keywords the person really
 * has. The AI only ever sees that one point and the person's skill names (never contact details). Nothing changes
 * until the person chooses "Use this", and anything the AI added that was not in the original is called out.
 */
export function BulletPolish({ resume, jd, apiKey, onChange }: { resume: Resume; jd: string; apiKey: string; onChange: (r: Resume) => void }) {
  const [state, setState] = useState<Record<string, State | undefined>>({});
  const set = (k: string, v: State | undefined) => setState((cur) => ({ ...cur, [k]: v }));

  const haveSkills = useMemo(() => skillGap(jd, resume).have, [jd, resume]);
  const skillNames = useMemo(() => [...new Set(resume.skills.flatMap((g) => g.items))], [resume.skills]);

  const roles = resume.experience.filter((e) => e.bullets.length > 0);
  if (!roles.length) return null;

  const replace = (roleId: string, index: number, text: string) =>
    onChange({ ...resume, experience: resume.experience.map((e) => (e.id === roleId ? { ...e, bullets: e.bullets.map((b, i) => (i === index ? text.slice(0, 300) : b)) } : e)) });

  async function run(roleId: string, i: number, role: string, company: string, bullet: string, mode: BulletMode, keyword?: string) {
    const k = key(roleId, i);
    set(k, { s: "busy", mode });
    const r = await callAi<BulletResult>(
      "/api/v1/bullet",
      { bullet, mode, role, company, skills: keyword && !skillNames.includes(keyword) ? [...skillNames, keyword].slice(0, 80) : skillNames.slice(0, 80), ...(keyword ? { keyword } : {}) },
      apiKey,
    );
    // the point may have been edited while we waited: only show the result for the text we asked about
    set(k, r.ok ? { s: "proposal", mode, keyword, text: r.data.text, novel: r.data.novel } : { s: "error", message: r.message });
  }

  return (
    <Card>
      <h2 className="font-display text-xl">Polish your points</h2>
      <p className="mt-1 text-sm text-ink-2">Change one point at a time. Nothing changes until you choose it. Only that point and your skill names go to the AI, never your contact details.</p>
      <div className="mt-4 space-y-3">
        {roles.map((e, ri) => (
          <details key={e.id} open={ri === 0} className="rounded-xl border border-line">
            <summary className="cursor-pointer px-3 py-3 text-sm font-medium sm:px-4">
              {[e.role, e.company].filter(Boolean).join(" at ") || "Job"} <span className="font-normal text-ink-2">({e.bullets.length} point{e.bullets.length === 1 ? "" : "s"})</span>
            </summary>
            <ul className="space-y-3 px-3 pb-3 sm:px-4">
              {e.bullets.map((b, i) => {
                const k = key(e.id, i);
                const st = state[k];
                const busy = st?.s === "busy";
                const candidates = haveSkills.filter((s) => !b.toLowerCase().includes(s.toLowerCase())).slice(0, 8);
                return (
                  <li key={k} className="rounded-lg bg-surface-2/60 p-3">
                    {st?.s === "editing" ? (
                      <div className="space-y-2">
                        <label htmlFor={`edit-${k}`} className="sr-only">Edit this point</label>
                        <textarea
                          id={`edit-${k}`}
                          value={st.text}
                          maxLength={300}
                          rows={3}
                          onChange={(ev) => set(k, { s: "editing", text: ev.target.value })}
                          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-base leading-relaxed sm:text-sm"
                        />
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            className="min-h-11 w-full sm:w-auto"
                            disabled={st.text.trim().length < 3}
                            onClick={() => {
                              replace(e.id, i, st.text.trim());
                              set(k, undefined);
                            }}
                          >
                            Save
                          </Button>
                          <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => set(k, undefined)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="break-words text-sm leading-relaxed">{b}</p>
                        {st?.s === "proposal" && (
                          <div className="mt-3 space-y-2 rounded-lg border border-accent/40 bg-surface p-3" role="group" aria-label="Suggested wording">
                            <p className="text-xs font-medium text-accent">Suggested</p>
                            <p className="break-words text-sm leading-relaxed">{st.text}</p>
                            {st.novel.length > 0 && (
                              <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn" role="note">
                                New wording that was not in yours: {st.novel.slice(0, 6).map((w) => `"${w}"`).join(", ")}. Use it only if it is true.
                              </p>
                            )}
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Button
                                className="min-h-11 w-full sm:w-auto"
                                onClick={() => {
                                  replace(e.id, i, st.text);
                                  set(k, undefined);
                                }}
                              >
                                Use this
                              </Button>
                              <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => void run(e.id, i, e.role, e.company, b, st.mode, st.keyword)}>Try again</Button>
                              <Button variant="quiet" className="min-h-11 w-full sm:w-auto" onClick={() => set(k, undefined)}>Keep mine</Button>
                            </div>
                          </div>
                        )}
                        {st?.s === "error" && (
                          <p role="alert" className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{st.message}</p>
                        )}
                        {st?.s === "keywords" && (
                          <div className="mt-3" role="group" aria-label="Keywords you can add">
                            {candidates.length ? (
                              <>
                                <p className="mb-2 text-xs text-ink-2">The job asks for these and you have them. Pick one to work into this point:</p>
                                <div className="flex flex-wrap gap-2">
                                  {candidates.map((s) => (
                                    <button key={s} type="button" onClick={() => void run(e.id, i, e.role, e.company, b, "keyword", s)} className="min-h-11 rounded-full bg-accent-soft px-4 text-sm font-medium text-accent hover:brightness-95 sm:min-h-9 sm:px-3">
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-ink-2">Every keyword from the job that you have is already in this point.</p>
                            )}
                          </div>
                        )}
                        {!st || st.s === "error" || st.s === "keywords" || busy ? (
                          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Change this point: ${short(b)}`}>
                            <Button variant="ghost" className="min-h-11 flex-1 px-3 py-1.5 text-xs sm:min-h-9 sm:flex-none" disabled={busy} aria-label={`Make shorter: ${short(b)}`} onClick={() => void run(e.id, i, e.role, e.company, b, "shorten")}>
                              {busy && st.mode === "shorten" ? "Working…" : "Shorter"}
                            </Button>
                            <Button variant="ghost" className="min-h-11 flex-1 px-3 py-1.5 text-xs sm:min-h-9 sm:flex-none" disabled={busy} aria-label={`Stronger opening verb: ${short(b)}`} onClick={() => void run(e.id, i, e.role, e.company, b, "stronger")}>
                              {busy && st.mode === "stronger" ? "Working…" : "Stronger verb"}
                            </Button>
                            <Button variant="ghost" className="min-h-11 flex-1 px-3 py-1.5 text-xs sm:min-h-9 sm:flex-none" disabled={busy} aria-expanded={st?.s === "keywords"} aria-label={`Add a keyword: ${short(b)}`} onClick={() => set(k, st?.s === "keywords" ? undefined : { s: "keywords" })}>
                              {busy && st.mode === "keyword" ? "Working…" : "Add keyword"}
                            </Button>
                            <Button variant="quiet" className="min-h-11 flex-1 px-3 py-1.5 text-xs sm:min-h-9 sm:flex-none" disabled={busy} aria-label={`Edit by hand: ${short(b)}`} onClick={() => set(k, { s: "editing", text: b })}>
                              Edit
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </Card>
  );
}
