"use client";

import { useDeferredValue, useMemo } from "react";
import { extractKeywords } from "@/lib/keywords";
import { LIMITS } from "@/lib/schema";
import { Card, Chip, Field, Textarea } from "../ui";

export function JdStep({ jd, setJd, error }: { jd: string; setJd: (s: string) => void; error?: string }) {
  const deferred = useDeferredValue(jd);
  const keywords = useMemo(() => extractKeywords(deferred, 18), [deferred]);

  return (
    <Card>
      <h2 className="font-display text-xl">Job description</h2>
      <p className="mb-4 text-sm text-ink-2">Paste the full posting. We pull out the keywords recruiters and ATS filters look for.</p>
      <Field label="Paste the job description" htmlFor="jd" error={error} hint={`${jd.length.toLocaleString()} / ${LIMITS.jd.toLocaleString()} characters`}>
        <Textarea id="jd" rows={12} value={jd} maxLength={LIMITS.jd} onChange={(e) => setJd(e.target.value)} placeholder="About the role, responsibilities, requirements..." />
      </Field>
      {keywords.length > 0 && (
        <div className="mt-5" aria-live="polite">
          <h3 className="mb-2 text-sm font-medium">Keywords we found</h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map((k) => (
              <Chip key={k.term} tone="neutral">
                {k.term}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
