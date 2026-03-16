/**
 * Reactive store data hook.
 *
 * Loads initial state from a store key via a loader function, then
 * listens for cross-window changes via onStoreChange. Returns the
 * current value, automatically updated when the other window writes.
 *
 * Replaces the repeated pattern:
 *   const [data, setData] = useState(loadFn);
 *   useEffect(() => onStoreChange(key, () => setData(loadFn())), []);
 */
import { useState, useEffect } from "react";
import { onStoreChange } from "../lib/store";

export function useStoreData<T>(key: string, loadFn: () => T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [data, setData] = useState<T>(loadFn);

  useEffect(() => {
    return onStoreChange(key, () => setData(loadFn()));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return [data, setData];
}
