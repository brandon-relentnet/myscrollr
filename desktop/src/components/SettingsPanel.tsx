import type { SubscriptionTier } from "../auth";

interface SettingsPanelProps {
  authenticated: boolean;
  tier: SubscriptionTier;
  pinned: boolean;
  onTogglePin: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onClose: () => void;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  uplink: "Uplink",
  uplink_unlimited: "Uplink Unlimited",
};

export default function SettingsPanel({
  authenticated,
  tier,
  pinned,
  onTogglePin,
  onLogin,
  onLogout,
  onClose,
}: SettingsPanelProps) {
  const sectionClass = "border border-edge rounded-lg overflow-hidden";
  const headerClass =
    "px-4 py-2.5 border-b border-edge bg-surface-2 text-[11px] font-mono font-semibold uppercase tracking-widest text-fg-3";
  const rowClass =
    "flex items-center justify-between px-4 py-3 text-[12px] font-mono";

  return (
    <div className="dashboard-content max-w-4xl mx-auto py-6 px-6 space-y-4">
      {/* Header with close button */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-mono font-semibold uppercase tracking-widest text-fg-2">
          Settings
        </span>
        <button
          onClick={onClose}
          className="text-fg-3 hover:text-fg-1 transition-colors text-[16px] leading-none px-1 cursor-pointer"
          title="Close settings"
        >
          &#x2715;
        </button>
      </div>

      {/* Account */}
      <div className={sectionClass}>
        <div className={headerClass}>Account</div>
        {authenticated ? (
          <>
            <div className={rowClass}>
              <span className="text-fg-3">Plan</span>
              <span className="text-accent font-semibold">
                {TIER_LABELS[tier]}
              </span>
            </div>
            <div className={`${rowClass} border-t border-edge`}>
              <span className="text-fg-3">Session</span>
              <button
                onClick={onLogout}
                className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded border border-edge text-fg-3 hover:text-red-400 hover:border-red-400/30 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <div className={rowClass}>
            <span className="text-fg-3">Not signed in</span>
            <button
              onClick={onLogin}
              className="text-[11px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-accent text-surface hover:bg-accent/90 transition-colors cursor-pointer"
            >
              Sign in
            </button>
          </div>
        )}
      </div>

      {/* Window */}
      <div className={sectionClass}>
        <div className={headerClass}>Window</div>
        <div className={rowClass}>
          <span className="text-fg-3">Always on top</span>
          <button
            onClick={onTogglePin}
            className={`text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded border transition-colors cursor-pointer ${
              pinned
                ? "border-accent/30 text-accent bg-accent/10"
                : "border-edge text-fg-3 hover:text-fg-2"
            }`}
          >
            {pinned ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* About */}
      <div className={sectionClass}>
        <div className={headerClass}>About</div>
        <div className={rowClass}>
          <span className="text-fg-3">Version</span>
          <span className="text-fg-2">0.1.0</span>
        </div>
        <div className={`${rowClass} border-t border-edge`}>
          <span className="text-fg-3">Runtime</span>
          <span className="text-fg-2">Tauri v2</span>
        </div>
      </div>
    </div>
  );
}
