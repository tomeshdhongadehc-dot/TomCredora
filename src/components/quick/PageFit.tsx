"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { applyCuts, linesOver, pagesFor, rankCuts, tightenSteps, type Cut } from "@/lib/fit";
import type { Resume } from "@/lib/schema";
import type { TemplateConfig } from "@/lib/templates";
import { ResumePaper } from "../ResumePaper";
import { Button } from "../ui";

type Item = { kind: "tighten"; label: string; config: TemplateConfig } | { kind: "cut"; cut: Cut };

interface Run {
  target: number;
  plan: Item[];
  /** how many items of the plan are applied right now */
  k: number;
  before: { resume: Resume; config: TemplateConfig };
}
interface Done {
  fits: boolean;
  pages: number;
  target: number;
  tightened: string[];
  cuts: Cut[];
  before: { resume: Resume; config: TemplateConfig };
}

const compose = (resume: Resume, config: TemplateConfig, plan: Item[], k: number) => {
  let cfg = config;
  const cuts: Cut[] = [];
  const tightened: string[] = [];
  for (const it of plan.slice(0, k)) {
    if (it.kind === "tighten") {
      cfg = it.config;
      tightened.push(it.label);
    } else cuts.push(it.cut);
  }
  return { resume: applyCuts(resume, cuts), config: cfg, cuts, tightened };
};

/**
 * Says how many pages the resume takes and, if it is longer than wanted, fits it: first a little tighter layout, then
 * the points that matter least for this job go. It shows exactly what changed and can undo it. The page is measured
 * on a hidden copy of the real resume, so what is counted is what is printed.
 */
export function PageFit({ resume, config, jd, onApply }: { resume: Resume; config: TemplateConfig; jd: string; onApply: (resume: Resume, config: TemplateConfig) => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [info, setInfo] = useState<{ pages: number; over: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const apply = useRef(onApply);
  useLayoutEffect(() => {
    apply.current = onApply;
  });
  const same = (a: { pages: number; over: number } | null, b: { pages: number; over: number }) => (a && a.pages === b.pages && a.over === b.over ? a : b);

  const view = useMemo(() => (run ? compose(resume, config, run.plan, run.k) : { resume, config, cuts: [] as Cut[], tightened: [] as string[] }), [run, resume, config]);

  useLayoutEffect(() => {
    const article = box.current?.querySelector<HTMLElement>(".rp-article");
    if (!article || !article.clientWidth) return;
    const h = article.scrollHeight;
    const w = article.clientWidth;
    const { pages } = pagesFor(h, w, view.config);
    if (!run) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the measurement can only be taken after the page is laid out
      const next = { pages, over: linesOver(h, w, view.config, 1) };
      setInfo((cur) => same(cur, next));
      return;
    }
    if (pages <= run.target || run.k >= run.plan.length) {
      apply.current(view.resume, view.config);
      setDone({ fits: pages <= run.target, pages, target: run.target, tightened: view.tightened, cuts: view.cuts, before: run.before });
      setRun(null);
      return;
    }
    setRun({ ...run, k: run.k + 1 });
  }, [run, view]);

  // fonts arriving can change the count: measure again once they are ready
  useLayoutEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (!live) return;
      const article = box.current?.querySelector<HTMLElement>(".rp-article");
      if (article?.clientWidth) {
        const next = { pages: pagesFor(article.scrollHeight, article.clientWidth, config).pages, over: linesOver(article.scrollHeight, article.clientWidth, config, 1) };
        setInfo((cur) => same(cur, next));
      }
    });
    return () => {
      live = false;
    };
  }, [config]);

  const start = (target: number) => {
    setDone(null);
    const plan: Item[] = [
      ...tightenSteps(config).map((t): Item => ({ kind: "tighten", label: t.label, config: t.config })),
      ...rankCuts(resume, jd).map((cut): Item => ({ kind: "cut", cut })),
    ];
    setRun({ target, plan, k: 0, before: { resume, config } });
  };
  const undo = () => {
    if (!done) return;
    apply.current(done.before.resume, done.before.config);
    setDone(null);
  };

  const working = !!run;
  const pages = info?.pages ?? 1;
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-2/50 p-3 sm:p-4" aria-label="Page fit">
      {/* a hidden copy of the real resume, only to measure it */}
      <div ref={box} aria-hidden inert style={{ position: "absolute", left: -10000, top: 0, width: 800, visibility: "hidden", pointerEvents: "none" }}>
        <ResumePaper resume={view.resume} config={view.config} showGuide={false} decorative />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" aria-live="polite" className="text-sm">
          {working ? (
            <span className="text-ink-2">Fitting to {run.target} page{run.target > 1 ? "s" : ""}…</span>
          ) : done ? (
            <span>
              {done.fits ? (
                <strong className="text-accent">Now {done.target === 1 ? "one page" : `${done.pages} pages`}.</strong>
              ) : (
                <strong className="text-warn">Still {done.pages} pages after trimming.</strong>
              )}
              {!done.fits && <span className="text-ink-2"> There is more here than fits. Choose a 2-page template, or remove something yourself in the workspace.</span>}
            </span>
          ) : !info ? (
            <span className="text-ink-2">Checking the length…</span>
          ) : pages === 1 ? (
            <span>
              <strong className="text-accent">1 page.</strong> <span className="text-ink-2">It fits.</span>
            </span>
          ) : (
            <span>
              <strong>{pages} pages.</strong> <span className="text-ink-2">About {info.over} line{info.over === 1 ? "" : "s"} over one page.</span>
            </span>
          )}
        </p>
        {!working && !done && info && pages > 1 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="min-h-11 w-full sm:w-auto" onClick={() => start(1)}>Fit to 1 page</Button>
            {pages > 2 && <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => start(2)}>Fit to 2 pages</Button>}
          </div>
        )}
        {done && (
          <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={undo}>Undo</Button>
        )}
      </div>

      {done && (done.tightened.length > 0 || done.cuts.length > 0) && (
        <div className="mt-3 text-sm" aria-label="What changed">
          {done.tightened.length > 0 && <p className="text-ink-2">Layout: {done.tightened.join(", ")}.</p>}
          {done.cuts.length > 0 && (
            <details className="mt-1" open>
              <summary className="cursor-pointer py-1 font-medium">Removed {done.cuts.length} point{done.cuts.length === 1 ? "" : "s"} that matter least for this job</summary>
              <ul className="mt-1 space-y-1.5">
                {done.cuts.map((c, i) => (
                  <li key={i} className="rounded-lg bg-surface px-3 py-2">
                    <span className="block text-xs text-ink-2">{c.where}</span>
                    <span className="block break-words">{c.text}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-2">Not what you wanted? Press Undo, or edit the points yourself in the workspace.</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
