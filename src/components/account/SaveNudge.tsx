"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { authMode } from "@/lib/auth/client";
import { signInHref } from "@/lib/auth/next";
import { EXPORTED_EVENT } from "@/lib/export/events";
import { useAccount } from "@/lib/sync/use-account";

const SNOOZE_KEY = "arb.nudge.until";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

const readSnoozed = () => {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
};

/** True when it makes sense to offer an account: accounts are on, nobody is signed in, and the visitor has not said "not now". */
function useOffer() {
  const acc = useAccount();
  const [snoozed, setSnoozed] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of storage after mount
    setSnoozed(readSnoozed());
  }, []);
  const snooze = () => {
    setSnoozed(true);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* storage blocked: it just comes back next visit */
    }
  };
  const available = acc.ready && !acc.email && authMode() !== "off";
  return { available, snoozed, snooze };
}

const COPY = {
  export: { title: "Keep this resume safe", text: "Save it to your account and open it on any phone or laptop. It is free, there is no password, and all it needs is your email." },
  profile: { title: "Do not lose your profile", text: "It is saved in this browser only. Add your email to keep it safe and use it on any device. Free, no password." },
  done: { title: "Like it? Save it", text: "Your resumes live in this browser only. Add your email to keep them safe and reach them from any device. Free, no password." },
} as const;

/**
 * A short, dismissible offer to sign in, shown at the moment someone has something worth keeping.
 * "export" appears only after they download or print a resume; the others appear straight away.
 */
export function SaveNudge({ kind, when = true, className = "" }: { kind: keyof typeof COPY; when?: boolean; className?: string }) {
  const { available, snoozed, snooze } = useOffer();
  const pathname = usePathname();
  const [exported, setExported] = useState(false);

  useEffect(() => {
    if (kind !== "export") return;
    const on = () => setExported(true);
    window.addEventListener(EXPORTED_EVENT, on);
    return () => window.removeEventListener(EXPORTED_EVENT, on);
  }, [kind]);

  if (!available || snoozed || !when || (kind === "export" && !exported)) return null;
  const c = COPY[kind];
  return (
    <section aria-label="Save your work" className={`flex flex-col gap-3 rounded-xl border border-line bg-accent-soft px-4 py-3 text-sm sm:flex-row sm:items-center ${className}`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{c.title}</p>
        <p className="mt-0.5 text-ink-2">{c.text}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={signInHref(pathname)} prefetch={false} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 font-medium text-accent-ink hover:brightness-110">
          Save to my account
        </Link>
        <button type="button" onClick={snooze} className="inline-flex min-h-11 items-center rounded-xl px-3 text-ink-2 hover:bg-surface hover:text-ink">
          Not now
        </button>
      </div>
    </section>
  );
}

/** A quiet one-line reminder that nothing is saved to an account yet, with a way to fix that. */
export function BrowserOnlyNote({ className = "" }: { className?: string }) {
  const { available } = useOffer();
  const pathname = usePathname();
  if (!available) return null;
  return (
    <p className={`text-xs text-ink-2 ${className}`}>
      Saved in this browser only.{" "}
      <Link href={signInHref(pathname)} prefetch={false} className="inline-flex min-h-6 items-center font-medium text-accent underline underline-offset-2">
        Sign in to keep it safe
      </Link>
    </p>
  );
}
