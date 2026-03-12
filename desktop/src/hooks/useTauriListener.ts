/**
 * Safe wrapper around Tauri's listen() that prevents listener leaks.
 *
 * The raw `listen().then(fn => { unlisten = fn })` pattern has a race
 * condition: if the component unmounts before `.then()` resolves, the
 * cleanup runs with `unlisten` still null, leaking the listener forever.
 *
 * This hook tracks a `cancelled` flag to immediately unlisten if the
 * component has already unmounted by the time registration completes.
 */
import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Event, EventCallback } from "@tauri-apps/api/event";

export function useTauriListener<T>(
  event: string,
  handler: EventCallback<T>,
  deps: React.DependencyList = [],
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    listen<T>(event, (e: Event<T>) => {
      handlerRef.current(e);
    }).then((fn) => {
      if (cancelled) {
        fn(); // already unmounted — clean up immediately
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}
