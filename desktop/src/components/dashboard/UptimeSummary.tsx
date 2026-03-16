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
import StatusListSummary from "./StatusListSummary";
import type { KumaMonitor } from "../../widgets/uptime/types";
import type { UptimeCardPrefs } from "./dashboardPrefs";

interface UptimeSummaryProps {
  prefs: UptimeCardPrefs;
}

export default function UptimeSummary({ prefs }: UptimeSummaryProps) {
  const [monitors] = useStoreData(LS_UPTIME_MONITORS, loadMonitors);

  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;
  const allUp = downCount === 0;

  return (
    <StatusListSummary<KumaMonitor>
      items={monitors}
      emptyMessage="No monitors connected"
      statusColor={(m) => MONITOR_STATUS_COLORS[m.status] ?? "bg-fg-4"}
      itemName={(m) => m.name}
      itemKey={(m) => String(m.id)}
      overall={
        prefs.health && monitors.length > 0
          ? {
              dot: allUp ? "bg-up" : "bg-down",
              label: allUp
                ? "All Systems Operational"
                : `${downCount} monitor${downCount !== 1 ? "s" : ""} down`,
            }
          : null
      }
      counts={
        prefs.monitorCount && monitors.length > 0 ? (
          <>
            <span className="text-up">{upCount} up</span>
            {downCount > 0 && <span className="text-down">{downCount} down</span>}
            <span className="text-fg-4">{monitors.length} total</span>
          </>
        ) : null
      }
      showItems={prefs.monitors}
    />
  );
}
