"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStorage } from "./draft";
import { notifyLocalChange, onSynced, registerFlush } from "./sync/bus";
import { emptyProfile, loadProfile, saveProfile, type Profile } from "./profile";
import type { StorageLike } from "./workspace";

/**
 * The saved profile, autosaved (debounced) to this browser. Renders empty on the first paint and fills in after
 * mount so server and client markup match. `update` takes a pure function, so quick successive taps never lose each other.
 */
export function useProfile() {
  const [profile, setProfileState] = useState<Profile>(emptyProfile);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const ref = useRef(profile);
  const storage = useRef<StorageLike | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current || !storage.current) return;
    dirty.current = false;
    saveProfile(storage.current, ref.current);
    setSaved(true);
    notifyLocalChange();
  }, []);

  useEffect(() => {
    storage.current = getStorage();
    const loaded = loadProfile(storage.current);
    if (loaded) {
      ref.current = loaded;
      setProfileState(loaded);
    }
    setReady(true);
    const unregisterFlush = registerFlush(flush);
    const unsubscribeSynced = onSynced(() => {
      if (dirty.current || !storage.current) return; // a pending edit is kept; it will sync as the newer copy
      const fresh = loadProfile(storage.current);
      if (fresh) {
        ref.current = fresh;
        setProfileState(fresh);
      }
    });
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    // Also save the moment a field loses focus or the page starts closing, so the short autosave delay can never lose typing.
    document.addEventListener("focusout", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      unregisterFlush();
      unsubscribeSynced();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("focusout", onHide);
      window.removeEventListener("beforeunload", onHide);
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (fn: (p: Profile) => Profile) => {
      const next = fn(ref.current);
      if (next === ref.current) return;
      ref.current = next;
      setProfileState(next);
      setSaved(false);
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    },
    [flush],
  );

  return { profile, ready, saved, update };
}
