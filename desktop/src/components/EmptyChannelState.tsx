/**
 * EmptyChannelState — shared empty-state placeholder for channel FeedTabs.
 *
 * Replaces the repeated empty-state pattern in finance, sports, and RSS feeds.
 *
 * Copy is intentionally pointed at the in-app navigation: the user already
 * sees the sidebar (Sources rail + "+ Add source") and the breadcrumb tabs
 * in the top bar. We highlight the "Settings" tab in the breadcrumb because
 * every channel page exposes its own configure UI on that tab — that's the
 * one tap that gets them from "empty feed" to "picking what to track".
 */
import { clsx } from "clsx";
import { Settings } from "lucide-react";

interface EmptyChannelStateProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** What hasn't been added yet (e.g. "stocks or crypto", "leagues", "feeds"). */
  noun: string;
  /** Whether the channel has config (i.e. user has picked items to track). */
  hasConfig: boolean;
  /** Whether the dashboard has loaded. */
  dashboardLoaded?: boolean;
  /** Verb for the loading state (e.g. "prices", "scores", "articles"). */
  loadingNoun?: string;
  /** Hint text for the action (e.g. "choose what to track", "pick your leagues"). */
  actionHint?: string;
  /** Navigate to the channel's Settings sub-tab. When provided, the hint becomes a button. */
  onConfigure?: () => void;
}

export default function EmptyChannelState({
  icon: Icon,
  noun,
  hasConfig,
  dashboardLoaded,
  loadingNoun,
  actionHint,
  onConfigure,
}: EmptyChannelStateProps) {
  return (
    <div
      className={clsx(
        "col-span-full flex flex-col items-center justify-center gap-3 py-12 px-6 bg-surface",
      )}
    >
      <Icon size={28} className="text-fg-4/40" />
      {dashboardLoaded === false ? (
        <p className="text-xs text-fg-4">
          Loading {loadingNoun ?? noun}&hellip;
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-fg-3">
            {hasConfig ? `No active ${noun} right now` : `No ${noun} added yet`}
          </p>
          {onConfigure ? (
            <button
              onClick={onConfigure}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-md",
                "px-2.5 py-1 text-xs font-medium",
                "text-accent bg-accent/10 hover:bg-accent/15",
                "transition-colors active:scale-[0.97]",
              )}
            >
              <Settings size={12} aria-hidden="true" />
              Open the Settings tab to {actionHint ?? `add ${noun}`}
            </button>
          ) : (
            <p className="text-xs text-fg-4 max-w-xs text-center leading-relaxed">
              Tap the{" "}
              <span className="text-fg-3 font-medium">Settings</span> tab in
              the top bar to {actionHint ?? `add ${noun}`}.
            </p>
          )}
          <p className="text-[11px] text-fg-4/70 text-center max-w-xs leading-relaxed">
            Looking for another source? Use{" "}
            <span className="text-fg-3 font-medium">+ Add source</span> in the
            sidebar to browse the catalog.
          </p>
        </>
      )}
    </div>
  );
}
