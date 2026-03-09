import type { SubscriptionTier } from "../../auth";
import { Section, DisplayRow, ActionRow, ResetButton } from "./SettingsControls";

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
  return (
    <div>
      <Section title="Account">
        {authenticated ? (
          <>
            <DisplayRow
              label="Plan"
              value={TIER_LABELS[tier]}
              valueClass="text-[12px] text-accent font-semibold"
            />
            <ActionRow
              label="Session"
              action="Sign out"
              actionClass="text-fg-4 hover:text-error hover:bg-error/10"
              onClick={onLogout}
            />
          </>
        ) : (
          <ActionRow
            label="Not signed in"
            action="Sign in"
            actionClass="bg-accent text-surface font-semibold hover:bg-accent/90"
            onClick={onLogin}
          />
        )}
      </Section>

      <Section title="About">
        <DisplayRow label="Version" value="0.1.0" />
        <DisplayRow label="Runtime" value="Tauri v2" />
      </Section>

      <Section title="Danger zone">
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] text-fg-2 leading-tight">
              Reset all settings
            </span>
            <span className="text-[10px] text-fg-4 leading-tight">
              Restore every setting to its factory default
            </span>
          </div>
          <ResetButton label="Reset everything" onClick={onResetAll} />
        </div>
      </Section>
    </div>
  );
}
