/**
 * Persistent store backed by @tauri-apps/plugin-store.
 *
 * Replaces localStorage with a write-through in-memory cache so all
 * existing synchronous read patterns continue to work unchanged.
 *
 * Both windows (ticker + main) call `initStore()` once on startup.
 * After that:
 *   - `getStore()` reads synchronously from the in-memory Map.
 *   - `setStore()` updates the Map immediately, then writes to disk
 *     asynchronously (fire-and-forget).
 *   - `onStoreChange()` listens for changes from the *other* window
 *     via the plugin's built-in cross-webview broadcast. An equality
 *     guard prevents the writing window from re-triggering its own
 *     callback, avoiding infinite loops.
 *
 * On first run after the migration, `initStore()` automatically reads
 * any existing `scrollr:*` keys from localStorage, writes them to the
 * Tauri store, and clears the old keys.
 */
import { LazyStore } from "@tauri-apps/plugin-store";

// ── Singleton store instance ────────────────────────────────────

const store = new LazyStore("scrollr.json");
const cache = new Map<string, unknown>();
let initialized = false;

// ── Initialization ──────────────────────────────────────────────

/**
 * Load all entries from disk into the in-memory cache, then run
 * the one-time localStorage migration if needed. Must be awaited
 * before the React tree renders.
 */
export async function initStore(): Promise<void> {
  if (initialized) return;

  // Load existing store entries into the cache
  const entries = await store.entries<unknown>();
  for (const [key, value] of entries) {
    cache.set(key, value);
  }

  // One-time migration from localStorage
  if (!cache.has("scrollr:store-migrated")) {
    migrateFromLocalStorage();
    await store.save();
  }

  initialized = true;
}

// ── Read / Write / Remove ───────────────────────────────────────

/** Synchronous read from the in-memory cache. */
export function getStore<T>(key: string, fallback: T): T {
  const value = cache.get(key);
  return value !== undefined ? (value as T) : fallback;
}

/** Update the cache immediately, then persist to disk async. */
export function setStore<T>(key: string, value: T): void {
  cache.set(key, value);
  store.set(key, value as unknown).catch(logWriteError);
}

/** Remove a key from both cache and disk. */
export function removeStore(key: string): void {
  cache.delete(key);
  store.delete(key).catch(logWriteError);
}

function logWriteError(err: unknown): void {
  console.error("[Scrollr] Store write failed:", err);
}

// ── Cross-window change listener ────────────────────────────────

/**
 * Subscribe to changes for a specific key. The callback fires only
 * when the value actually differs from the local cache (i.e. when
 * the *other* window wrote a new value). Returns an unsubscribe fn.
 */
export function onStoreChange<T>(
  key: string,
  callback: (newValue: T) => void,
): () => void {
  let unlisten: (() => void) | null = null;
  let disposed = false;

  store.onKeyChange<T>(key, (newValue) => {
    if (disposed) return;

    // Equality guard: skip if the value matches what we already have.
    // This prevents the window that wrote the value from re-triggering
    // its own handler and avoids infinite update loops.
    const current = cache.get(key);
    if (stableStringify(current) === stableStringify(newValue)) return;

    cache.set(key, newValue);
    callback(newValue as T);
  }).then((fn) => {
    if (disposed) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  return () => {
    disposed = true;
    unlisten?.();
  };
}

// ── localStorage migration ──────────────────────────────────────

function migrateFromLocalStorage(): void {
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("scrollr:")) continue;

    // Skip if the store already has this key (shouldn't happen on
    // first migration, but guards against double-run).
    if (cache.has(key)) {
      keysToRemove.push(key);
      continue;
    }

    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    // Try to parse as JSON; fall back to raw string for bare values
    // like scrollr:widget:weather:unit which stores "celsius" without
    // JSON.stringify wrapping.
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }

    cache.set(key, value);
    store.set(key, value);
    keysToRemove.push(key);
  }

  // Clear migrated keys from localStorage
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }

  // Mark migration as complete
  cache.set("scrollr:store-migrated", true);
  store.set("scrollr:store-migrated", true);
}

// ── Utilities ───────────────────────────────────────────────────

/** JSON serialization for equality comparison.
 *  Note: key order is not guaranteed stable, but in practice both
 *  windows serialize identically since they share the same source. */
function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
