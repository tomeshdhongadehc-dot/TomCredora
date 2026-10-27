"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { authMode } from "@/lib/auth/client";
import { signInHref, signUpHref } from "@/lib/auth/next";
import { useAccount } from "@/lib/sync/use-account";

/** The sync code is downloaded when it is first needed, not with every page. */
const sync = () => import("@/lib/sync/manager");

const ago = (t: number | null) => {
  if (!t) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 10 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const base = "inline-flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition hover:bg-surface-2";

/**
 * Header button. Signed out it is a link to the sign-in page (which returns you to where you were); signed in it opens
 * a small account dialog (sync status, sign out, delete my data). Shows nothing when accounts are not configured,
 * so the app stays purely local until they are.
 */
export function AccountMenu({ className = "" }: { className?: string }) {
  const acc = useAccount();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // authMode() reads build-time variables, so the server and the first client paint agree on whether to show this.
  if (authMode() === "off") return null;
  // Until we know whether someone is signed in, keep the button's space so the header does not jump sideways
  // when it appears (that shift once made a click on a neighbouring link miss).
  if (!acc.ready)
    return (
      <span aria-hidden className="invisible inline-flex items-center gap-1">
        <span className={`${base} ${className}`}>Sign in</span>
        <span className="hidden min-h-10 items-center whitespace-nowrap px-3 py-1.5 text-sm font-medium sm:inline-flex">Sign up</span>
      </span>
    );

  if (!acc.email)
    return (
      <span className="inline-flex items-center gap-1">
        <Link href={signInHref(pathname || "/")} prefetch={false} className={`${base} text-ink-2 hover:text-ink ${className}`}>
          Sign in
        </Link>
        <Link href={signUpHref(pathname || "/")} prefetch={false} className="hidden min-h-10 items-center whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:brightness-110 sm:inline-flex">
          Sign up
        </Link>
      </span>
    );

  const close = () => {
    setOpen(false);
    setConfirmDelete(false);
    setNote(null);
  };
  async function remove() {
    setBusy(true);
    const r = await (await sync()).deleteCloudData();
    setBusy(false);
    setConfirmDelete(false);
    if (r.ok) close();
    else setNote(r.error ?? "Could not delete.");
  }

  const status = acc.phase === "syncing" ? "Syncing…" : acc.phase === "synced" ? `Synced ${ago(acc.lastSyncedAt)}` : (acc.message ?? "Ready to sync");
  const warn = acc.phase === "error" || acc.phase === "offline" || acc.phase === "unavailable";
  const btn = "inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2 disabled:opacity-50";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={`${base} text-accent ${className}`}>
        <span aria-hidden className="mr-1.5 inline-grid size-5 place-items-center rounded-full bg-accent text-[0.7rem] text-accent-ink">
          {acc.email[0].toUpperCase()}
        </span>
        <span className="sr-only">Account: {acc.email}. </span>
        <span className="hidden sm:inline">Account</span>
      </button>

      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => e.target === ref.current && close()}
        aria-labelledby={`${uid}-t`}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
      >
        {/* Rendered only while open, so a closed dialog adds nothing to the page. */}
        {open && (
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 id={`${uid}-t`} className="font-display text-xl">
                Your account
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="-mr-2 -mt-1 grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-surface-2">
                ✕
              </button>
            </div>
            <p className="break-all text-sm">
              Signed in as <strong>{acc.email}</strong>
            </p>
            <p role="status" className={`rounded-lg px-3 py-2.5 text-sm ${warn ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>
              {status}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={async () => void (await sync()).syncNow()} disabled={acc.phase === "syncing"}>
                Sync now
              </button>
              <button
                type="button"
                className={btn}
                onClick={async () => {
                  await (await sync()).signOut(false);
                  close();
                }}
              >
                Sign out
              </button>
            </div>
            <p className="text-xs text-ink-2">Signing out keeps your data on this device. On a shared computer, clear it too.</p>
            <div className="space-y-2 border-t border-line pt-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btn} onClick={async () => void (await sync()).signOut(true)}>
                  Sign out and clear this device
                </button>
                {!confirmDelete && (
                  <button type="button" className={`${btn} text-bad`} onClick={() => setConfirmDelete(true)}>
                    Delete my saved data…
                  </button>
                )}
              </div>
              {confirmDelete && (
                <div role="alertdialog" aria-label="Confirm deleting saved data" className="rounded-lg border border-bad/40 bg-bad-soft/50 p-3 text-sm">
                  <p>This removes your saved copy from our servers and signs you out. The data on this device stays.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className={`${btn} text-bad`} onClick={remove} disabled={busy}>
                      Yes, delete it
                    </button>
                    <button type="button" className={btn} onClick={() => setConfirmDelete(false)}>
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </div>
            {note && (
              <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2.5 text-sm text-bad">
                {note}
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
