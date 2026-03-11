/**
 * Tauri Store wrapper for persistent, cross-window state.
 *
 * Replaces the fragile localStorage + StorageEvent mechanism for
 * inter-window communication. The store persists to a JSON file
 * in the app data directory and emits change events to all windows.
 *
 * For now, this wraps the official @tauri-apps/plugin-store.
 * Preferences migration from localStorage to the store happens
 * incrementally as components are refactored into routes.
 */
import { Store } from "@tauri-apps/plugin-store";

// Lazy-initialized store instance (shared across the app window).
let _store: Store | null = null;

/**
 * Get or create the shared store instance.
 * The store is backed by `scrollr-prefs.json` in the app data dir.
 */
export async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await Store.load("scrollr-prefs.json", {
      defaults: {},
      autoSave: 100,
    });
  }
  return _store;
}

/**
 * Read a typed value from the store.
 * Returns the fallback if the key doesn't exist or the store isn't ready.
 */
export async function storeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a typed value to the store.
 * Automatically persists to disk via autoSave.
 */
export async function storeSet<T>(key: string, value: T): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
}

/**
 * Subscribe to changes on a specific key.
 * Returns an unsubscribe function.
 */
export async function storeWatch<T>(
  key: string,
  callback: (value: T | undefined) => void,
): Promise<() => void> {
  const store = await getStore();
  return store.onKeyChange<T>(key, callback);
}
