import type { SubscriptionTier } from "../../auth";
import { Section, DisplayRow, ResetButton } from "./SettingsControls";

interface AccountSettingsProps {
  authenticated: boolean;
  tier: SubscriptionTier;
  onLogin: () => void;
  onLogout: () => void;
  onResetAll: () => void;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  uplink: "Uplink",
  uplink_unlimited: "Uplink Unlimited",
};

export default function AccountSettings({
  authenticated,
  tier,
  onLogin,
  onLogout,
  onResetAll,
}: AccountSettingsProps) {
  const btnBase =
    "text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded cursor-pointer transition-colors";

  return (
    <div className="space-y-4">
      <Section title="Account">
        {authenticated ? (
          <>
            <DisplayRow
              label="Plan"
              value={TIER_LABELS[tier]}
              valueClass="text-accent font-semibold text-[12px] font-mono"
            />
            <div className="flex items-center justify-between px-4 py-3 text-[12px] font-mono">
              <span className="text-fg-3">Session</span>
              <button
                onClick={onLogout}
                className={`${btnBase} border border-edge text-fg-3 hover:text-red-400 hover:border-red-400/30`}
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 text-[12px] font-mono">
            <span className="text-fg-3">Not signed in</span>
            <button
              onClick={onLogin}
              className={`${btnBase} font-bold bg-accent text-surface hover:bg-accent/90`}
            >
              Sign in
            </button>
          </div>
        )}
      </Section>

      <Section title="About">
        <DisplayRow label="Version" value="0.1.0" />
        <DisplayRow label="Runtime" value="Tauri v2" />
      </Section>

      <Section title="Danger zone">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-mono text-fg-2">
              Reset all settings
            </span>
            <span className="text-[10px] font-mono text-fg-4">
              Restore every setting to its factory default
            </span>
          </div>
          <ResetButton label="Reset everything" onClick={onResetAll} />
        </div>
      </Section>
    </div>
  );
}
