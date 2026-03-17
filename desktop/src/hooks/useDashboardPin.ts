/**
 * Generic dashboard pin hook — persists a pinned value via loadPref/savePref.
 *
 * Replaces per-component boilerplate: PINNED_KEY + loadXxx + saveXxx + useState.
 */
import { useState, useCallback } from "react";
import { loadPref, savePref } from "../preferences";

export function useDashboardPin<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => loadPref<T>(key, fallback));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      savePref(key, next);
    },
    [key],
  );

  return [value, update];
}
