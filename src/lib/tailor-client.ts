"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { validateResume } from "./clean";
import type { LedgerEntryState, ReviewState } from "./review-state";
import type { Resume } from "./schema";

/**
 * Optional "bring your own key": the shared free key has a small daily quota. Kept in this tab's sessionStorage
 * only (gone when the tab closes) and sent only to our own API, never stored server-side.
 */
export function useGeminiKey() {
  const [apiKey, setApiKey] = useState("");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
      setApiKey(sessionStorage.getItem("arb.gemini") ?? "");
    } catch {
      /* storage blocked: the field simply starts empty */
    }
  }, []);
  const saveKey = useCallback((v: string) => {
    setApiKey(v);
    try {
      if (v) sessionStorage.setItem("arb.gemini", v);
      else sessionStorage.removeItem("arb.gemini");
    } catch {
      /* ignore */
    }
  }, []);
  return { apiKey, saveKey };
}

/**
 * What the server (and so the AI) sees in place of your contact details. Your real name, email, phone, location,
 * headline and links never leave the browser during tailoring: they are put back on the result here, afterwards.
 */
export const ANONYMOUS_CONTACT: Resume["contact"] = { fullName: "Candidate", headline: "", email: "candidate@example.com", phone: "", location: "", links: [] };

export type TailorResult =
  | { ok: true; resume: Resume; review: ReviewState }
  | { ok: false; message: string };

/**
 * The one place that calls the tailoring API. The same profile + job description always reuses the same
 * idempotency key, so a double-click or retry never costs a second AI call.
 */
export function useTailor(apiKey: string) {
  const keyRef = useRef<{ payload: string; key: string } | null>(null);
  return useCallback(
    async (resume: Resume, jd: string): Promise<TailorResult> => {
      const v = validateResume(resume);
      if (!v.ok) return { ok: false, message: "Fix the highlighted profile fields first: " + Object.values(v.errors).slice(0, 2).join("; ") };
      const payload = JSON.stringify({ profile: { ...v.resume, contact: ANONYMOUS_CONTACT }, jd });
      if (keyRef.current?.payload !== payload) keyRef.current = { payload, key: crypto.randomUUID() };
      try {
        const res = await fetch("/api/v1/tailor", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": keyRef.current.key,
            ...(apiKey.trim() ? { "x-gemini-key": apiKey.trim() } : {}),
          },
          body: payload,
        });
        const j = await res.json();
        if (!res.ok) {
          const retry = res.headers.get("retry-after");
          return { ok: false, message: j?.error?.message ?? "Something went wrong." + (retry ? ` Try again in ${retry}s.` : "") };
        }
        return { ok: true, resume: { ...j.resume, contact: v.resume.contact }, review: { ledger: j.ledger as LedgerEntryState[], questions: j.questions, resolved: [] } };
      } catch {
        return { ok: false, message: "Network problem. Check your connection and try again." };
      }
    },
    [apiKey],
  );
}
