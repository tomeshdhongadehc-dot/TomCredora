"use client";

import { useCallback, useEffect, useState } from "react";

const PREFIX = "arb.input.";

/**
 * Text that is typed into a box but not yet "added" (a custom skill, a point, an email) normally vanishes if you press
 * Back, reload or switch pages. This keeps it for this tab (sessionStorage) until it is added or cleared, the way a
 * Google Form keeps what you typed. Pass an empty key to turn the saving off.
 * It starts empty on the server and the first paint, then fills in, so the markup always matches.
 */
export function usePersistedText(key: string): [string, (v: string) => void] {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!key) return;
    try {
      const saved = sessionStorage.getItem(PREFIX + key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
      if (saved) setValue(saved);
    } catch {
      /* storage blocked: the box just starts empty */
    }
  }, [key]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      if (!key) return;
      try {
        if (next) sessionStorage.setItem(PREFIX + key, next);
        else sessionStorage.removeItem(PREFIX + key);
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [value, set];
}
