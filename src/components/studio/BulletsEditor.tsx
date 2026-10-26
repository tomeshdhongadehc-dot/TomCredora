"use client";

import { useId } from "react";
import { LIMITS } from "@/lib/schema";
import { Button } from "../ui";

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Word-count feedback that matches the ATS check (8-25 words reads best). */
function Count({ text }: { text: string }) {
  const n = words(text);
  if (!n) return null;
  const good = n >= 8 && n <= 25;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${good ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"}`} title="Bullets of 8 to 25 words read best">
      {n} words
    </span>
  );
}

/** One textarea per bullet, with reorder, delete and a word-count hint. */
export function BulletsEditor({ label, bullets, onChange, max = LIMITS.bulletsPerRole, placeholder }: { label: string; bullets: string[]; onChange: (b: string[]) => void; max?: number; placeholder?: string }) {
  const uid = useId();
  const set = (i: number, v: string) => onChange(bullets.map((b, j) => (j === i ? v : b)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= bullets.length) return;
    const next = [...bullets];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {bullets.map((b, i) => (
        <div key={i} className="rounded-lg border border-line bg-bg/40 p-2">
          <label htmlFor={`${uid}-${i}`} className="sr-only">
            {label} {i + 1}
          </label>
          <textarea
            id={`${uid}-${i}`}
            value={b}
            rows={2}
            maxLength={LIMITS.bullet}
            placeholder={placeholder ?? "What you did, how, and the result"}
            onChange={(e) => set(i, e.target.value)}
            className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm leading-relaxed [field-sizing:content] focus:border-accent"
          />
          <div className="mt-1 flex items-center gap-1">
            <Count text={b} />
            <span className="flex-1" />
            <Button variant="quiet" className="!px-2 !py-0.5" aria-label={`Move ${label} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
            <Button variant="quiet" className="!px-2 !py-0.5" aria-label={`Move ${label} ${i + 1} down`} disabled={i === bullets.length - 1} onClick={() => move(i, 1)}>↓</Button>
            <Button variant="quiet" className="!px-2 !py-0.5 text-xs text-bad" aria-label={`Delete ${label} ${i + 1}`} onClick={() => onChange(bullets.filter((_, j) => j !== i))}>Delete</Button>
          </div>
        </div>
      ))}
      <Button variant="ghost" className="!py-1.5 text-xs" disabled={bullets.length >= max} onClick={() => onChange([...bullets, ""])}>
        + Add bullet
      </Button>
    </fieldset>
  );
}
