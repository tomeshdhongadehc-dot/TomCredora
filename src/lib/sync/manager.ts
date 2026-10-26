"use client";

import { authMode, getAuth } from "../auth/client";
import { getStorage } from "../draft";
import { emitSynced, flushAll, onLocalChange } from "./bus";
import { syncOnce } from "./engine";
import { getAccountState, setAccount } from "./store";

const set = setAccount;

let started = false;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastRun = 0;

/** Ask for a sync soon. Many requests close together become one. */
function schedule(delay: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    const session = await auth.getSession();
    if (!session) {
      set({ email: null, phase: "idle", message: null });
      return;
    }
    set({ email: session.email, phase: "syncing" });
    const r = await syncOnce({ storage: getStorage(), fetch: (u, i) => fetch(u, i), token: () => session.token, flush: flushAll });
    lastRun = Date.now();
    switch (r.state) {
      case "synced":
        set({ phase: "synced", lastSyncedAt: r.at, message: null });
        if (r.pulled) emitSynced();
        break;
      case "signed-out":
        set({ phase: "error", message: "Your sign-in expired. Please sign in again." });
        break;
      case "offline":
        set({ phase: "offline", message: "You are offline. Your changes are saved here and will sync when you are back." });
        break;
      case "unavailable":
        set({ phase: "unavailable", message: "Syncing is not available on this server yet." });
        break;
      case "error":
        set({ phase: "error", message: r.message });
        break;
    }
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(1000);
    }
  }
}

async function refreshSession() {
  const auth = getAuth();
  if (!auth) return;
  const s = await auth.getSession();
  if (!s) {
    set({ ready: true, email: null, phase: "idle", message: null });
    return;
  }
  const first = getAccountState().email !== s.email;
  set({ ready: true, email: s.email });
  if (first) void syncNow(); // just signed in: merge this browser with the account straight away
}

/** Start once per page load. Does nothing when no sign-in is configured. */
export function startAccountSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const mode = authMode();
  set({ mode });
  const auth = getAuth();
  if (!auth) {
    set({ ready: true });
    return;
  }
  void refreshSession();
  auth.onChange(() => void refreshSession());

  onLocalChange(() => getAccountState().email && schedule(3000)); // after you stop editing for a moment
  const wake = () => {
    if (document.visibilityState === "visible" && getAccountState().email && Date.now() - lastRun > 15_000) schedule(500);
  };
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", () => getAccountState().email && schedule(500));
  setInterval(() => document.visibilityState === "visible" && getAccountState().email && void syncNow(), 120_000);
}

/** Sign out. By default this browser keeps its copy of your data; `clearDevice` removes it (for shared computers). */
export async function signOut(clearDevice: boolean, syncFirst = !clearDevice): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  // make sure the last edits are in the account before leaving (but not right after deleting the account copy)
  if (syncFirst) await syncNow();
  await auth.signOut();
  set({ email: null, phase: "idle", message: null, lastSyncedAt: null });
  if (clearDevice) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) ?? "");
      for (const k of keys) if (k.startsWith("arb.")) localStorage.removeItem(k);
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    location.reload();
  }
}

/** Remove the saved copy from our servers, then sign out. The data on this device stays. */
export async function deleteCloudData(): Promise<{ ok: boolean; error?: string }> {
  const auth = getAuth();
  const session = await auth?.getSession();
  if (!auth || !session) return { ok: false, error: "Sign in first." };
  try {
    const res = await fetch("/api/v1/sync", { method: "DELETE", headers: { authorization: `Bearer ${session.token}` } });
    if (!res.ok) return { ok: false, error: "Could not delete your data. Try again." };
  } catch {
    return { ok: false, error: "You are offline. Try again when you are back." };
  }
  await signOut(false, false);
  return { ok: true };
}
