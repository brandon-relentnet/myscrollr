/**
 * Shared sysmon data hook — deduplicates IPC calls across consumers.
 *
 * Multiple components (ticker, FeedTab, taskbar chip) all need the same
 * system info.  Instead of each one running its own `invoke()` call,
 * they share a single module-level fetch that caches the latest result
 * for a short window (default 500 ms).  If two consumers poll within
 * the same window, only one IPC round-trip happens.
 */

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setStore } from "../lib/store";
import { LS_SYSMON_DATA } from "../constants";

// ── Shared SystemInfo type ──────────────────────────────────────

export interface SystemInfo {
  cpuName: string;
  cpuCores: number;
  cpuUsage: number;
  cpuFreqMhz: number | null;
  gpuName: string | null;
  gpuUsage: number | null;
  gpuVramTotal: number | null;
  gpuVramUsed: number | null;
  gpuPowerWatts: number | null;
  gpuPowerCapWatts: number | null;
  gpuClockMhz: number | null;
  memTotal: number;
  memUsed: number;
  osName: string;
  hostname: string;
  uptime: number;
  components: { label: string; temp: number; max: number; critical: number | null }[];
  network: { name: string; rxBytes: number; txBytes: number }[];
}

// ── Module-level cache ──────────────────────────────────────────

/** How long a cached result is considered fresh (ms). */
const CACHE_TTL = 500;

let cachedData: SystemInfo | null = null;
let cachedAt = 0;
let inflight: Promise<SystemInfo> | null = null;

/**
 * Fetch system info, returning a cached value if one exists within
 * the TTL window.  Concurrent callers share the same in-flight
 * promise so only one IPC call happens at a time.
 */
export async function fetchSysmonData(): Promise<SystemInfo> {
  const now = Date.now();
  if (cachedData && now - cachedAt < CACHE_TTL) return cachedData;

  if (!inflight) {
    inflight = invoke<SystemInfo>("get_system_info")
      .then((data) => {
        cachedData = data;
        cachedAt = Date.now();
        setStore(LS_SYSMON_DATA, data);
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

// ── React hook ──────────────────────────────────────────────────

/**
 * Poll system info at `intervalMs` and return the latest snapshot.
 * Multiple instances share the same underlying IPC call via the cache.
 */
export function useSysmonData(intervalMs: number): SystemInfo | null {
  const [data, setData] = useState<SystemInfo | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function poll() {
      try {
        const info = await fetchSysmonData();
        if (mountedRef.current) setData(info);
      } catch {
        /* ignore IPC failures */
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return data;
}
