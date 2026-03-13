/**
 * SysmonSummary — dashboard card content for the System Monitor widget.
 *
 * Shows CPU and RAM usage with mini progress bars, GPU %, and uptime.
 * Respects per-card display preferences from the dashboard editor.
 */
import { useSysmonData } from "../../hooks/useSysmonData";
import clsx from "clsx";
import type { SysmonCardPrefs } from "./dashboardPrefs";

interface SysmonSummaryProps {
  prefs: SysmonCardPrefs;
}

function usageColor(pct: number): string {
  if (pct < 50) return "#34d399";
  if (pct < 75) return "#fbbf24";
  return "#f87171";
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function SysmonSummary({ prefs }: SysmonSummaryProps) {
  const data = useSysmonData(2000);

  if (!data) {
    return (
      <p className="text-[11px] text-fg-4 italic py-1">
        Loading system info...
      </p>
    );
  }

  const cpuPct = Math.round(data.cpuUsage ?? 0);
  const memPct = data.memTotal
    ? Math.round(((data.memUsed ?? 0) / data.memTotal) * 100)
    : 0;
  const gpuPct = data.gpuUsage != null ? Math.round(data.gpuUsage) : null;

  return (
    <div className="space-y-2">
      {/* CPU bar */}
      {prefs.cpu && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-fg-3 w-8 shrink-0">CPU</span>
          <div className="flex-1 h-1.5 rounded-full bg-base-300 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${cpuPct}%`, background: usageColor(cpuPct) }}
            />
          </div>
          <span
            className={clsx(
              "text-[11px] font-mono font-semibold tabular-nums w-8 text-right",
            )}
            style={{ color: usageColor(cpuPct) }}
          >
            {cpuPct}%
          </span>
        </div>
      )}

      {/* RAM bar */}
      {prefs.ram && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-fg-3 w-8 shrink-0">RAM</span>
          <div className="flex-1 h-1.5 rounded-full bg-base-300 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${memPct}%`, background: usageColor(memPct) }}
            />
          </div>
          <span
            className="text-[11px] font-mono font-semibold tabular-nums w-8 text-right"
            style={{ color: usageColor(memPct) }}
          >
            {memPct}%
          </span>
        </div>
      )}

      {/* GPU bar */}
      {prefs.gpu && gpuPct !== null && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-fg-3 w-8 shrink-0">GPU</span>
          <div className="flex-1 h-1.5 rounded-full bg-base-300 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${gpuPct}%`, background: usageColor(gpuPct) }}
            />
          </div>
          <span
            className="text-[11px] font-mono font-semibold tabular-nums w-8 text-right"
            style={{ color: usageColor(gpuPct) }}
          >
            {gpuPct}%
          </span>
        </div>
      )}

      {prefs.uptime && data.uptime != null && (
        <div className="flex items-center pt-1 border-t border-edge/30">
          <span className="text-[10px] text-fg-4">
            {formatUptime(data.uptime)}
          </span>
        </div>
      )}
    </div>
  );
}
