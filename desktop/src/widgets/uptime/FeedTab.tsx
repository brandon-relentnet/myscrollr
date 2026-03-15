/**
 * Uptime Kuma widget FeedTab — desktop-native.
 *
 * Connects to a user-provided Uptime Kuma public status page and
 * displays monitor statuses. Monitor data is cached in localStorage
 * so the ticker window can read it via StorageEvent.
 *
 * Setup flow: paste URL → fetch → display monitors.
 * Connected state: auto-refresh via TanStack Query at the configured
 * poll interval, sync results to localStorage for the ticker.
 *
 * TODO: Phase E — migrate to Tauri store plugin.
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, RefreshCw, Unlink, Loader2 } from "lucide-react";
import type { FeedTabProps, WidgetManifest } from "../../types";
import type { KumaMonitor, MonitorStatus } from "./types";
import { fetchKumaStatus, loadMonitors, saveMonitors } from "./types";
import { useShell } from "../../shell-context";
import { savePrefs } from "../../preferences";
import type { AppPreferences } from "../../preferences";
import { LS_UPTIME_MONITORS } from "../../constants";

// ── Widget manifest ─────────────────────────────────────────────

export const uptimeWidget: WidgetManifest = {
  id: "uptime",
  name: "Uptime",
  tabLabel: "Uptime",
  description: "Monitor status from Uptime Kuma",
  hex: "#10b981",
  icon: Activity,
  info: {
    about:
      "The Uptime widget connects to your Uptime Kuma status page and " +
      "shows real-time monitor statuses on your ticker.",
    usage: [
      "Paste your Uptime Kuma public status page URL to connect.",
      "All monitors from your status page appear with their current status.",
      "Hide specific monitors from the ticker in the Settings tab.",
      "Configure the poll interval to control how often statuses refresh.",
    ],
  },
  FeedTab: UptimeFeedTab,
};

// ── Status helpers ──────────────────────────────────────────────

const STATUS_LABELS: Record<MonitorStatus, string> = {
  up: "Up",
  down: "Down",
  pending: "Pending",
  maintenance: "Maintenance",
};

const STATUS_COLORS: Record<MonitorStatus, string> = {
  up: "bg-up",
  down: "bg-down",
  pending: "bg-warning",
  maintenance: "bg-info",
};

const STATUS_TEXT_COLORS: Record<MonitorStatus, string> = {
  up: "text-up",
  down: "text-down",
  pending: "text-warning",
  maintenance: "text-info",
};

// ── FeedTab ─────────────────────────────────────────────────────

function UptimeFeedTab({ mode: feedMode }: FeedTabProps) {
  const compact = feedMode === "compact";
  const shell = useShell();
  const queryClient = useQueryClient();
  const url = shell.prefs.widgets.uptime.url;
  const pollInterval = shell.prefs.widgets.uptime.pollInterval;

  const [inputUrl, setInputUrl] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Load cached monitors for initial display
  const [monitors, setMonitors] = useState<KumaMonitor[]>(loadMonitors);

  // Listen for localStorage changes from the ticker window
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_UPTIME_MONITORS) setMonitors(loadMonitors());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Auto-refresh when connected via TanStack Query
  const { data, error, isLoading } = useQuery({
    queryKey: ["uptime-kuma", url],
    queryFn: () => fetchKumaStatus(url),
    enabled: url.length > 0,
    refetchInterval: pollInterval * 1000,
    staleTime: (pollInterval * 1000) / 2,
    retry: 2,
  });

  // Sync query results to localStorage + local state
  useEffect(() => {
    if (data && data.length > 0) {
      setMonitors(data);
      saveMonitors(data);
    }
  }, [data]);

  // ── Connect handler ───────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;

    setIsConnecting(true);
    setConnectError(null);

    try {
      const result = await fetchKumaStatus(trimmed);
      if (result.length === 0) {
        setConnectError("No monitors found on this status page.");
        setIsConnecting(false);
        return;
      }

      // Save monitors to localStorage
      saveMonitors(result);
      setMonitors(result);

      // Save URL to structured prefs
      const next: AppPreferences = {
        ...shell.prefs,
        widgets: {
          ...shell.prefs.widgets,
          uptime: { ...shell.prefs.widgets.uptime, url: trimmed },
        },
      };
      shell.onPrefsChange(next);
      savePrefs(next);

      setInputUrl("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "Failed to connect");
      setConnectError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, [inputUrl, shell]);

  // ── Disconnect handler ────────────────────────────────────────

  const handleDisconnect = useCallback(() => {
    // Clear monitors
    saveMonitors([]);
    setMonitors([]);

    // Clear URL from prefs
    const next: AppPreferences = {
      ...shell.prefs,
      widgets: {
        ...shell.prefs.widgets,
        uptime: { ...shell.prefs.widgets.uptime, url: "" },
      },
    };
    shell.onPrefsChange(next);
    savePrefs(next);

    // Remove query cache
    queryClient.removeQueries({ queryKey: ["uptime-kuma"] });
  }, [shell, queryClient]);

  // ── Refresh handler ───────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["uptime-kuma", url] });
  }, [queryClient, url]);

  // ── Disconnected / setup state ────────────────────────────────

  if (!url) {
    return (
      <div className="p-4 flex flex-col items-center justify-center gap-3">
        <Activity size={24} className="text-widget-uptime/60" />
        <span className="text-xs font-mono text-fg-2 text-center">
          Connect to your Uptime Kuma status page
        </span>

        <div className="w-full max-w-sm space-y-2">
          <input
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
            placeholder="https://status.example.com/status/my-page"
            className="w-full text-xs font-mono px-3 py-2 rounded-lg bg-surface-2 border border-edge text-fg placeholder:text-fg-4 focus:border-widget-uptime/50 focus:outline-none transition-colors"
          />
          <button
            onClick={handleConnect}
            disabled={isConnecting || !inputUrl.trim()}
            className="w-full text-xs font-mono font-semibold text-widget-uptime px-3 py-2 rounded-lg bg-widget-uptime/10 border border-widget-uptime/25 hover:bg-widget-uptime/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isConnecting && <Loader2 size={12} className="animate-spin" />}
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        </div>

        {connectError && (
          <p className="text-[11px] font-mono text-error text-center max-w-sm">
            {connectError}
          </p>
        )}
      </div>
    );
  }

  // ── Loading state (connected but no data yet) ─────────────────

  if (isLoading && monitors.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center gap-2">
        <Loader2 size={16} className="animate-spin text-widget-uptime/60" />
        <span className="text-xs font-mono text-fg-3">Loading monitors...</span>
      </div>
    );
  }

  // ── Connected state ───────────────────────────────────────────

  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;

  return (
    <div className="p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-semibold text-widget-uptime/80 uppercase tracking-wider shrink-0">
            Uptime
          </span>
          <span className="text-[10px] font-mono text-fg-4 truncate" title={url}>
            {url}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="text-xs font-mono text-widget-uptime/70 hover:text-widget-uptime transition-colors"
            title="Refresh now"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={handleDisconnect}
            className="text-xs font-mono text-fg-3 hover:text-error transition-colors"
            title="Disconnect"
          >
            <Unlink size={12} />
          </button>
        </div>
      </div>

      {/* Status summary */}
      <div className="flex items-center gap-3 px-1 text-[11px] font-mono text-fg-3">
        <span className="text-up">{upCount} up</span>
        {downCount > 0 && <span className="text-down">{downCount} down</span>}
        <span className="ml-auto text-fg-4">{monitors.length} monitors</span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-2 py-1.5 text-[11px] font-mono text-error/80 bg-error/5 border border-error/15 rounded">
          Failed to refresh: {error.message}
        </div>
      )}

      {/* Monitor list */}
      <div className={compact ? "space-y-1" : "space-y-1.5"}>
        {monitors.map((monitor) => (
          <MonitorRow key={monitor.id} monitor={monitor} compact={compact} />
        ))}
      </div>
    </div>
  );
}

// ── MonitorRow ──────────────────────────────────────────────────

function MonitorRow({
  monitor,
  compact,
}: {
  monitor: KumaMonitor;
  compact: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 rounded-md border border-edge/50 bg-surface-2/30 ${compact ? "py-1.5" : "py-2"}`}
    >
      {/* Status dot */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[monitor.status]}${monitor.status === "down" ? " animate-pulse" : ""}`} />

      {/* Name */}
      <span className="text-xs font-mono text-fg truncate flex-1">
        {monitor.name}
      </span>

      {/* Uptime % */}
      {monitor.uptimePercent != null && (
        <span className="text-[11px] font-mono text-fg-3 tabular-nums shrink-0">
          {monitor.uptimePercent.toFixed(monitor.uptimePercent === 100 ? 0 : 2)}%
        </span>
      )}

      {/* Response time */}
      {!compact && monitor.responseTime != null && (
        <span className="text-[10px] font-mono text-fg-4 tabular-nums shrink-0">
          {monitor.responseTime}ms
        </span>
      )}

      {/* Status label */}
      <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider shrink-0 ${STATUS_TEXT_COLORS[monitor.status]}`}>
        {STATUS_LABELS[monitor.status]}
      </span>
    </div>
  );
}
