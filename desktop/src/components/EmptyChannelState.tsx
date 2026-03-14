/**
 * EmptyChannelState — shared empty-state placeholder for channel FeedTabs.
 *
 * Replaces the repeated empty-state pattern in finance, sports, and RSS feeds.
 */
import { clsx } from "clsx";

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
}

export default function EmptyChannelState({
  icon: Icon,
  noun,
  hasConfig,
  dashboardLoaded,
  loadingNoun,
  actionHint,
}: EmptyChannelStateProps) {
  return (
    <div
      className={clsx(
        "col-span-full flex flex-col items-center justify-center gap-2 py-12 bg-surface",
      )}
    >
      <Icon size={28} className="text-fg-4/40" />
      {dashboardLoaded === false ? (
        <p className="text-xs text-fg-4">
          Loading {loadingNoun ?? noun}&hellip;
        </p>
      ) : hasConfig ? (
        <p className="text-sm font-medium text-fg-3">
          No active {noun} right now
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-fg-3">
            No {noun} added yet
          </p>
          <p className="text-xs text-fg-4">
            Go to the{" "}
            <span className="text-fg-3 font-medium">Settings</span> tab to{" "}
            {actionHint ?? `add ${noun}`}.
          </p>
        </>
      )}
    </div>
  );
}
