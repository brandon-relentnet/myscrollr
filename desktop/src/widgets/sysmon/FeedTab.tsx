import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FeedTabProps } from "~/channels/types";
import type { WidgetManifest } from "~/widgets/types";

// ── Types ───────────────────────────────────────────────────────

interface SystemInfo {
  cpuName: string;
  cpuCores: number;
  cpuUsage: number;
  memTotal: number;
  memUsed: number;
  swapTotal: number;
  swapUsed: number;
  osName: string;
  hostname: string;
  uptime: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function formatUptime(secs: number): string {
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function usageColor(pct: number): string {
  if (pct < 50) return "text-emerald-400";
  if (pct < 75) return "text-amber-400";
  return "text-red-400";
}

// ── Usage Bar ───────────────────────────────────────────────────

function UsageBar({
  label,
  used,
  total,
  formatFn,
}: {
  label: string;
  used: number;
  total: number;
  formatFn?: (n: number) => string;
}) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const fmt = formatFn ?? formatBytes;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-fg-3 uppercase tracking-wider">
          {label}
        </span>
        <span className={`text-[9px] font-mono tabular-nums ${usageColor(pct)}`}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-widget-sysmon/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-widget-sysmon transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="text-[8px] font-mono text-fg-4 tabular-nums">
        {fmt(used)} / {fmt(total)}
      </div>
    </div>
  );
}

// ── FeedTab Component ───────────────────────────────────────────

function SysmonFeedTab({ mode: feedMode }: FeedTabProps) {
  const compact = feedMode === "compact";
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const data = await invoke<SystemInfo>("get_system_info");
        if (!cancelled) {
          setInfo(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Error state ─────────────────────────────────────────────
  if (error && !info) {
    return (
      <div className="p-4 flex flex-col items-center justify-center gap-2">
        <span className="text-[10px] font-mono text-error">{error}</span>
        <span className="text-[9px] font-mono text-fg-4">
          System monitor requires the desktop app
        </span>
      </div>
    );
  }

  // ── Loading state ───────────────────────────────────────────
  if (!info) {
    return (
      <div className="p-4 flex items-center justify-center">
        <span className="text-[9px] font-mono text-fg-4">
          Loading system info...
        </span>
      </div>
    );
  }

  const memPct = info.memTotal > 0 ? (info.memUsed / info.memTotal) * 100 : 0;

  // ── Compact render ──────────────────────────────────────────
  if (compact) {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-mono font-semibold text-widget-sysmon/70 uppercase tracking-wider">
            System
          </span>
          <span className="text-[8px] font-mono text-fg-4">
            up {formatUptime(info.uptime)}
          </span>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-widget-sysmon/[0.04] border border-widget-sysmon/10">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[9px] font-mono text-widget-sysmon/50 shrink-0">
              CPU
            </span>
            <span className={`text-sm font-mono font-semibold tabular-nums ${usageColor(info.cpuUsage)}`}>
              {Math.round(info.cpuUsage)}%
            </span>
          </div>
          <div className="w-px h-4 bg-widget-sysmon/10" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[9px] font-mono text-widget-sysmon/50 shrink-0">
              RAM
            </span>
            <span className={`text-sm font-mono font-semibold tabular-nums ${usageColor(memPct)}`}>
              {Math.round(memPct)}%
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Comfort render ──────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold text-widget-sysmon/70 uppercase tracking-wider">
          System Monitor
        </span>
        <span className="text-[8px] font-mono text-fg-4">
          up {formatUptime(info.uptime)}
        </span>
      </div>

      {/* System info */}
      <div className="px-3 py-2 rounded-lg bg-widget-sysmon/[0.04] border border-widget-sysmon/10 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono text-fg-3 truncate">
            {info.cpuName}
          </span>
          <span className="text-[9px] font-mono text-fg-4 shrink-0">
            {info.cpuCores} cores
          </span>
        </div>
        <div className="text-[8px] font-mono text-fg-4 truncate">
          {info.osName} &middot; {info.hostname}
        </div>
      </div>

      {/* CPU usage */}
      <div className="px-3 py-3 rounded-xl bg-widget-sysmon/[0.04] border border-widget-sysmon/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono text-widget-sysmon/60 uppercase tracking-wider">
            CPU
          </span>
          <span className={`text-lg font-mono font-bold tabular-nums ${usageColor(info.cpuUsage)}`}>
            {Math.round(info.cpuUsage)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-widget-sysmon/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-widget-sysmon transition-all duration-500"
            style={{ width: `${Math.min(100, info.cpuUsage)}%` }}
          />
        </div>
      </div>

      {/* Memory */}
      <div className="px-3 py-3 rounded-xl bg-widget-sysmon/[0.04] border border-widget-sysmon/10">
        <UsageBar
          label="Memory"
          used={info.memUsed}
          total={info.memTotal}
        />
      </div>

      {/* Swap (only if swap exists) */}
      {info.swapTotal > 0 && (
        <div className="px-3 py-3 rounded-xl bg-widget-sysmon/[0.04] border border-widget-sysmon/10">
          <UsageBar
            label="Swap"
            used={info.swapUsed}
            total={info.swapTotal}
          />
        </div>
      )}
    </div>
  );
}

// ── Manifest ────────────────────────────────────────────────────

export const sysmonWidget: WidgetManifest = {
  id: "sysmon",
  name: "System Monitor",
  tabLabel: "System",
  hex: "#06b6d4",
  desktopOnly: true,
  FeedTab: SysmonFeedTab,
};

export default SysmonFeedTab;
