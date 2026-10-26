"use client";

import type { AuthMode } from "../auth/client";

/**
 * The account state the header button shows. Deliberately tiny and dependency-free: it is on every page, while the
 * sync code that updates it (manager.ts) is only downloaded when someone is, or is becoming, signed in.
 */
export type Phase = "idle" | "syncing" | "synced" | "offline" | "error" | "unavailable";
export interface AccountState {
  mode: AuthMode;
  /** false until we know whether someone is signed in */
  ready: boolean;
  email: string | null;
  phase: Phase;
  lastSyncedAt: number | null;
  message: string | null;
}

const initial: AccountState = { mode: "off", ready: false, email: null, phase: "idle", lastSyncedAt: null, message: null };
let state: AccountState = initial;
const listeners = new Set<() => void>();

export const setAccount = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
};
export const getAccountState = () => state;
export const getServerAccountState = () => initial;
export const subscribeAccount = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));
