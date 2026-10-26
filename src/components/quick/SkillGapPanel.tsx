"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import type { Resume } from "@/lib/schema";
import { usePersistedText } from "@/lib/use-persisted-text";
import { skillGap, skillDisplay } from "@/lib/skill-gap";
import { Button } from "../ui";

interface Props {
  jd: string;
  /** the profile being sent */
  resume: Resume;
  /** the user confirmed they have this skill */
  onAdd: (skill: string) => void;
  /** the user took a skill they had tapped back out */
  onRemove: (skill: string) => void;
}

/**
 * Skills the job asks for, set against the profile. Ones the user has are listed first on the resume automatically.
 * Ones they do not have are never added by us: each is a button the user taps only if it is true.
 */
export function SkillGapPanel({ jd, resume, onAdd, onRemove }: Props) {
  const deferred = useDeferredValue(jd);
  const gap = useMemo(() => skillGap(deferred, resume), [deferred, resume]);
  // skills tapped this visit stay on screen (pressed) so a mis-tap can be undone
  const [tapped, setTapped] = useState<string[]>([]);
  const [own, setOwn] = usePersistedText("jdskill");
  const ownId = useId();

  if (deferred.trim().length < 40) return null;
  const missing = [...new Set([...gap.missing, ...tapped])];
  const have = gap.have.filter((s) => !tapped.includes(s));
  if (!missing.length && !have.length) return null;

  const toggle = (s: string) => {
    if (tapped.includes(s)) {
      setTapped((t) => t.filter((x) => x !== s));
      onRemove(s);
    } else {
      setTapped((t) => [...t, s]);
      onAdd(s);
    }
  };
  const addOwn = () => {
    const t = skillDisplay(own.trim());
    if (!t) return;
    if (!tapped.includes(t) && !have.includes(t)) {
      setTapped((x) => [...x, t]);
      onAdd(t);
    }
    setOwn("");
  };

  return (
    <div className="mt-5 space-y-4 rounded-xl border border-line bg-surface-2/50 p-4" role="region" aria-label="Skills this job asks for">
      {have.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">You have these. They go first on your resume.</p>
          <ul className="flex flex-wrap gap-2" aria-label="Skills you have that this job wants">
            {have.map((s) => <li key={s} className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">✓ {s}</li>)}
          </ul>
        </div>
      )}
      <div>
        <p className="text-sm font-medium">{missing.length ? "The job also asks for these, and they are not in your profile." : "Anything else from this job that you have?"}</p>
        <p className="mb-2 text-xs text-ink-2">Tap only the ones you really have. We never add a skill for you, and tapped ones are saved to your profile.</p>
        {missing.length > 0 && (
          <div role="group" aria-label="Skills in this job that are not in your profile" className="flex flex-wrap gap-2">
            {missing.map((s) => {
              const on = tapped.includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2"}`}>
                  {on ? "✓ " : "+ "}{s}{on ? "" : " (I have this)"}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex max-w-md gap-2">
          <label htmlFor={ownId} className="sr-only">Another skill from this job that you have</label>
          <input id={ownId} value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOwn(); } }} placeholder="Another skill from the job that you have" maxLength={40}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
          <Button type="button" variant="ghost" onClick={addOwn} disabled={!own.trim()} aria-label="Add this skill (I have it)">Add</Button>
        </div>
      </div>
    </div>
  );
}
