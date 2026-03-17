/**
 * Generic ticker exclusion hook — shared by widget config panels
 * that let users toggle items on/off the scrolling ticker.
 */
import { useCallback } from "react";

export function useTickerExclusion<T extends string | number>(
  list: T[],
  fieldName: string,
  setTicker: (patch: Record<string, T[]>) => void,
): { isExcluded: (item: T) => boolean; toggle: (item: T) => void } {
  const isExcluded = useCallback(
    (item: T) => list.includes(item),
    [list],
  );

  const toggle = useCallback(
    (item: T) => {
      const next = list.includes(item)
        ? list.filter((v) => v !== item)
        : [...list, item];
      setTicker({ [fieldName]: next });
    },
    [list, fieldName, setTicker],
  );

  return { isExcluded, toggle };
}
