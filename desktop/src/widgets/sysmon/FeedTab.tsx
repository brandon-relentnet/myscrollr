import { Activity } from "lucide-react";
import type { FeedTabProps } from "~/channels/types";
import type { WidgetManifest } from "~/widgets/types";
import { useSysmonData } from "../../hooks/useSysmonData";
import type { SystemInfo } from "../../hooks/useSysmonData";

// ── Types ───────────────────────────────────────────────────────

type ComponentTemp = SystemInfo["components"][number];

interface TempReading {
  temp: number;
  critical: number | null;
}

// ── Constants ───────────────────────────────────────────────────

const POLL_INTERVAL = 2000;

// ── Helpers ─────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb.toFixed(1)} GB`;
  const tb = gb / 1024;
  return `${tb.toFixed(2)} TB`;
}

function formatRate(bytesPerInterval: number): string {
  const bytesPerSec = bytesPerInterval / (POLL_INTERVAL / 1000);
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  const kbps = bytesPerSec / 1024;
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  const mbps = kbps / 1024;
  return `${mbps.toFixed(1)} MB/s`;
}

function formatUptime(secs: number): string {
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Format MHz as GHz when >= 1000, otherwise MHz. */
function formatFreq(mhz: number): string {
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(1)} GHz`;
  return `${mhz} MHz`;
}

/** Format watts, rounding to nearest integer. */
function formatWatts(w: number): string {
  return `${Math.round(w)}W`;
}

function usageColor(pct: number): string {
  if (pct < 50) return "#34d399";
  if (pct < 75) return "#fbbf24";
  return "#f87171";
}

function usageColorClass(pct: number): string {
  if (pct < 50) return "text-emerald-400";
  if (pct < 75) return "text-amber-400";
  return "text-red-400";
}

function tempColor(temp: number, critical: number | null): string {
  if (critical && temp >= critical * 0.9) return "#f87171";
  if (temp >= 80) return "#f87171";
  if (temp >= 60) return "#fbbf24";
  return "#34d399";
}

function tempColorClass(temp: number, critical: number | null): string {
  if (critical && temp >= critical * 0.9) return "text-red-400";
  if (temp >= 80) return "text-red-400";
  if (temp >= 60) return "text-amber-400";
  return "text-emerald-400";
}

/** Find CPU package/die temperature sensor. */
function findCpuTemp(components: ComponentTemp[]): TempReading | null {
  const m = components.find((c) =>
    /package id|^tctl$|^tdie$/i.test(c.label),
  );
  return m ? { temp: m.temp, critical: m.critical } : null;
}

/** Find GPU temperature sensor (AMD edge/junction, nvidia, intel). */
function findGpuTemp(components: ComponentTemp[]): TempReading | null {
  const m = components.find((c) =>
    /^edge$|^junction$|gpu/i.test(c.label),
  );
  return m ? { temp: m.temp, critical: m.critical } : null;
}

// ── Detail line helper ──────────────────────────────────────────

/** Join non-null stat fragments with · separator. */
function DetailLine({ items }: { items: (string | null | undefined)[] }) {
  const filtered = items.filter(Boolean) as string[];
  if (filtered.length === 0) return null;
  return (
    <div className="text-xs font-mono text-fg-3 tabular-nums">
      {filtered.join(" \u00B7 ")}
    </div>
  );
}

// ── FeedTab Component ───────────────────────────────────────────

function SysmonFeedTab({ mode: feedMode }: FeedTabProps) {
  const compact = feedMode === "compact";
  const info = useSysmonData(POLL_INTERVAL);

  // ── Loading state ───────────────────────────────────────────
  if (!info) {
    return (
      <div className="p-4 flex items-center justify-center">
        <span className="text-xs font-mono text-fg-3">
          Loading system info...
        </span>
      </div>
    );
  }

  const memPct =
    info.memTotal > 0 ? (info.memUsed / info.memTotal) * 100 : 0;
  const cpuTemp = findCpuTemp(info.components);
  const gpuTemp = findGpuTemp(info.components);

  // ── Compact ─────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-mono font-semibold text-widget-sysmon/80 uppercase tracking-wider">
            System
          </span>
          <span className="text-xs font-mono text-fg-3">
            up {formatUptime(info.uptime)}
          </span>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-widget-sysmon/[0.04] border border-widget-sysmon/10">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-xs font-mono text-widget-sysmon/70 shrink-0">
              CPU
            </span>
            <span
              className={`text-sm font-mono font-semibold tabular-nums ${usageColorClass(info.cpuUsage)}`}
            >
              {Math.round(info.cpuUsage)}%
            </span>
          </div>
          <div className="w-px h-4 bg-widget-sysmon/10" />
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-xs font-mono text-widget-sysmon/70 shrink-0">
              RAM
            </span>
            <span
              className={`text-sm font-mono font-semibold tabular-nums ${usageColorClass(memPct)}`}
            >
              {Math.round(memPct)}%
            </span>
          </div>
          {(info.gpuUsage !== null || gpuTemp) && (
            <>
              <div className="w-px h-4 bg-widget-sysmon/10" />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-mono text-widget-sysmon/70">
                  GPU
                </span>
                {info.gpuUsage !== null ? (
                  <span
                    className={`text-sm font-mono font-semibold tabular-nums ${usageColorClass(info.gpuUsage)}`}
                  >
                    {Math.round(info.gpuUsage)}%
                  </span>
                ) : gpuTemp ? (
                  <span
                    className={`text-sm font-mono font-semibold tabular-nums ${tempColorClass(gpuTemp.temp, gpuTemp.critical)}`}
                  >
                    {Math.round(gpuTemp.temp)}&deg;
                  </span>
                ) : null}
              </div>
            </>
          )}
          {info.gpuPowerWatts !== null && (
            <>
              <div className="w-px h-4 bg-widget-sysmon/10" />
              <span className="text-sm font-mono font-semibold tabular-nums text-fg-2 shrink-0">
                {formatWatts(info.gpuPowerWatts)}
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Comfort ─────────────────────────────────────────────────

  // Build GPU header subtitle: "NITRO+ RX 7900 XTX Vapor-X · 24 GB"
  const gpuSubtitle = info.gpuName
    ? info.gpuVramTotal
      ? `${info.gpuName} \u00B7 ${formatBytes(info.gpuVramTotal)}`
      : info.gpuName
    : null;

  return (
    <div className="p-4 space-y-3">
      {/* Header: device info + uptime */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-semibold text-widget-sysmon/80 uppercase tracking-wider">
            System Monitor
          </span>
          <span className="text-xs font-mono text-fg-3">
            up {formatUptime(info.uptime)}
          </span>
        </div>
        <div className="text-xs font-mono text-fg-2 truncate">
          {info.cpuName} &middot; {info.cpuCores} cores
        </div>
        {gpuSubtitle && (
          <div className="text-xs font-mono text-fg-2 truncate">
            {gpuSubtitle}
          </div>
        )}
        <div className="text-xs font-mono text-fg-3 truncate">
          {info.osName} &middot; {info.hostname}
        </div>
      </div>

      {/* 2x2 stats grid */}
      <div className="grid grid-cols-2 rounded-xl border border-widget-sysmon/10 overflow-hidden">
        {/* CPU */}
        <div className="p-3 border-r border-b border-widget-sysmon/10 bg-widget-sysmon/[0.03] space-y-1.5">
          <span className="text-xs font-mono text-widget-sysmon/70 uppercase tracking-wider">
            CPU
          </span>
          <div className="text-[10px] font-mono text-fg-3 uppercase tracking-wider -mt-1">
            Utilization
          </div>
          <div
            className={`text-xl font-mono font-bold tabular-nums ${usageColorClass(info.cpuUsage)}`}
          >
            {Math.round(info.cpuUsage)}%
          </div>
          <div className="h-1.5 rounded-full bg-widget-sysmon/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, info.cpuUsage)}%`,
                background: `linear-gradient(90deg, #34d399, ${usageColor(info.cpuUsage)})`,
              }}
            />
          </div>
          <DetailLine
            items={[
              info.cpuFreqMhz !== null ? formatFreq(info.cpuFreqMhz) : null,
              cpuTemp
                ? `${Math.round(cpuTemp.temp)}\u00B0C`
                : null,
            ]}
          />
        </div>

        {/* Memory */}
        <div className="p-3 border-b border-widget-sysmon/10 bg-widget-sysmon/[0.03] space-y-1.5">
          <span className="text-xs font-mono text-widget-sysmon/70 uppercase tracking-wider">
            Memory
          </span>
          <div
            className={`text-xl font-mono font-bold tabular-nums ${usageColorClass(memPct)}`}
          >
            {Math.round(memPct)}%
          </div>
          <div className="h-1.5 rounded-full bg-widget-sysmon/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, memPct)}%`,
                background: `linear-gradient(90deg, #34d399, ${usageColor(memPct)})`,
              }}
            />
          </div>
          <div className="text-xs font-mono text-fg-3 tabular-nums">
            {formatBytes(info.memUsed)} / {formatBytes(info.memTotal)}
          </div>
        </div>

        {/* GPU */}
        <div className="p-3 border-r border-widget-sysmon/10 bg-widget-sysmon/[0.03] space-y-1.5">
          <span className="text-xs font-mono text-widget-sysmon/70 uppercase tracking-wider">
            GPU
          </span>
          {info.gpuUsage !== null ? (
            <>
              <div className="text-[10px] font-mono text-fg-3 uppercase tracking-wider -mt-1">
                Utilization
              </div>
              <div
                className={`text-xl font-mono font-bold tabular-nums ${usageColorClass(info.gpuUsage)}`}
              >
                {Math.round(info.gpuUsage)}%
              </div>
              <div className="h-1.5 rounded-full bg-widget-sysmon/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, info.gpuUsage)}%`,
                    background: `linear-gradient(90deg, #34d399, ${usageColor(info.gpuUsage)})`,
                  }}
                />
              </div>
              <DetailLine
                items={[
                  info.gpuClockMhz !== null
                    ? formatFreq(info.gpuClockMhz)
                    : null,
                  info.gpuPowerWatts !== null
                    ? formatWatts(info.gpuPowerWatts)
                    : null,
                  gpuTemp
                    ? `${Math.round(gpuTemp.temp)}\u00B0C`
                    : null,
                ]}
              />
              {info.gpuVramTotal !== null && info.gpuVramUsed !== null && (
                <div className="text-xs font-mono text-fg-3 tabular-nums">
                  {formatBytes(info.gpuVramUsed)} /{" "}
                  {formatBytes(info.gpuVramTotal)} VRAM
                </div>
              )}
            </>
          ) : gpuTemp ? (
            <div
              className={`text-xl font-mono font-bold tabular-nums ${tempColorClass(gpuTemp.temp, gpuTemp.critical)}`}
            >
              {Math.round(gpuTemp.temp)}&deg;C
            </div>
          ) : (
            <div className="text-sm font-mono text-fg-3">&mdash;</div>
          )}
        </div>

        {/* Network */}
        <div className="p-3 bg-widget-sysmon/[0.03] space-y-1.5">
          <span className="text-xs font-mono text-widget-sysmon/70 uppercase tracking-wider">
            Network
          </span>
          {info.network.length > 0 ? (
            <div className="space-y-1.5">
              {info.network.map((iface) => (
                <div key={iface.name} className="space-y-0.5">
                  <div className="text-xs font-mono text-fg-3 truncate">
                    {iface.name}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-emerald-400/90 tabular-nums">
                      {"\u2191"} {formatRate(iface.txBytes)}
                    </span>
                    <span className="text-xs font-mono text-sky-400/90 tabular-nums">
                      {"\u2193"} {formatRate(iface.rxBytes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm font-mono text-fg-3">&mdash;</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manifest ────────────────────────────────────────────────────

export const sysmonWidget: WidgetManifest = {
  id: "sysmon",
  name: "System Monitor",
  tabLabel: "System",
  description: "Live CPU, memory, and GPU stats",
  hex: "#06b6d4",
  icon: Activity,
  info: {
    about:
      "The System Monitor widget displays live hardware metrics on your ticker, including CPU usage, memory consumption, and GPU stats. Available on the desktop app only.",
    usage: [
      "CPU, memory, and GPU usage appear as a consolidated chip on the ticker.",
      "Toggle individual metrics (CPU, memory, GPU, GPU power) in the Configuration tab.",
      "The feed view shows detailed real-time stats including temperatures and per-component breakdowns.",
      "Pin the system monitor chip to keep it stationary on one side of the ticker.",
    ],
  },
  desktopOnly: true,
  FeedTab: SysmonFeedTab,
};

export default SysmonFeedTab;
