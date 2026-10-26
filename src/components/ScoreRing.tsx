"use client";

import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const R = 44;
const C = 2 * Math.PI * R;

/** Animated 0-100 ring. Count-up is skipped when the user prefers reduced motion. */
export function ScoreRing({ score, label = "ATS score" }: { score: number; label?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? score : 0);
  const [shown, setShown] = useState(reduce ? score : 0);

  useEffect(() => {
    const unsub = mv.on("change", (v) => setShown(Math.round(v)));
    const controls = animate(mv, score, { duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] });
    return () => {
      unsub();
      controls.stop();
    };
  }, [score, mv, reduce]);

  const tone = score >= 80 ? "var(--accent)" : score >= 55 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="relative size-28 shrink-0" role="img" aria-label={`${label}: ${score} out of 100`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={tone}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - shown / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold tabular-nums">{shown}</span>
        <span className="text-[11px] uppercase tracking-wider text-ink-2">{label}</span>
      </div>
    </div>
  );
}
