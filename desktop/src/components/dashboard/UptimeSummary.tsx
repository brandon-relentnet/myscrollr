/**
 * UptimeSummary — dashboard card content for the Uptime widget.
 *
 * Shows overall health status, monitor count, and up/down breakdown.
 * Reads from the same Tauri store data the full Uptime widget uses.
 * Respects per-card display preferences from the dashboard editor.
 */
import { loadMonitors, MONITOR_STATUS_COLORS } from "../../widgets/uptime/types";
import { useStoreData } from "../../hooks/useStoreData";
import { LS_UPTIME_MONITORS } from "../../constants";
import type { UptimeCardPrefs } from "./dashboardPrefs";

interface UptimeSummaryProps {
  prefs: UptimeCardPrefs;
}

export default function UptimeSummary({ prefs }: UptimeSummaryProps) {
  const [monitors] = useStoreData(LS_UPTIME_MONITORS, loadMonitors);

  if (monitors.length === 0) {
    return (
      <p className="text-[11px] text-fg-4 italic py-1">
        No monitors connected
      </p>
    );
  }

  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;
  const allUp = downCount === 0;

  return (
    <div className="space-y-1.5">
      {/* Overall health */}
      {prefs.health && (
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${allUp ? "bg-up" : "bg-down"}`} />
          <span className="text-xs font-mono text-fg">
            {allUp ? "All Systems Operational" : `${downCount} monitor${downCount !== 1 ? "s" : ""} down`}
          </span>
        </div>
      )}

      {/* Monitor count */}
      {prefs.monitorCount && (
        <div className="flex items-center gap-3 text-[11px] font-mono text-fg-3">
          <span className="text-up">{upCount} up</span>
          {downCount > 0 && <span className="text-down">{downCount} down</span>}
          <span className="text-fg-4">{monitors.length} total</span>
        </div>
      )}

      {/* Individual monitors */}
      {prefs.monitors && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {monitors.slice(0, 6).map((m) => (
            <div key={m.id} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${MONITOR_STATUS_COLORS[m.status] ?? "bg-fg-4"}`} />
              <span className="text-[10px] font-mono text-fg-3 truncate max-w-[120px]">
                {m.name}
              </span>
            </div>
          ))}
          {monitors.length > 6 && (
            <span className="text-[10px] font-mono text-fg-4">
              +{monitors.length - 6} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
