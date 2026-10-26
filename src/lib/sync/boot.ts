"use client";

import { authMode, mayBeSignedIn } from "../auth/client";
import { setAccount } from "./store";

/** Download and start the sync code. Only ever called for someone who is, or is becoming, signed in. */
export function startSync(): Promise<void> {
  return import("./manager").then((m) => m.startAccountSync());
}

/** Run when the browser is idle, so loading the sync code never competes with showing the page. */
const idle = (fn: () => void) => {
  const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 3000 });
  else setTimeout(fn, 800);
};

let booted = false;

/**
 * Called once per page load. A signed-out visitor costs nothing: the button just says "Sign in". Someone who may
 * already be signed in (a stored session, or returning from an email link) gets the sync code, loaded when idle.
 */
export function bootAccount(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;
  const mode = authMode();
  if (mode === "off") return;
  if (!mayBeSignedIn()) {
    setAccount({ mode, ready: true });
    return;
  }
  setAccount({ mode, ready: false });
  idle(() => void startSync());
}
