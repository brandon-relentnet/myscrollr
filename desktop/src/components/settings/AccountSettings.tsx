import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { TIER_LABELS, getUserIdentity } from "../../auth";
import { authFetch } from "../../api/client";
import { TIER_LIMITS, isUnlimited } from "../../tierLimits";
import type { SubscriptionTier } from "../../auth";
import { Section, DisplayRow, ActionRow, ResetButton } from "./SettingsControls";
import ConfirmDialog from "../ConfirmDialog";

// ── Props ───────────────────────────────────────────────────────

interface AccountSettingsProps {
  authenticated: boolean;
  tier: SubscriptionTier;
  onLogin: () => void;
  onLogout: () => void;
  onResetAll: () => void;
}

export default function AccountSettings({
  authenticated,
  tier,
  onLogin,
  onLogout,
  onResetAll,
}: AccountSettingsProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const identity = authenticated ? getUserIdentity() : null;
  const userLabel = identity?.email ?? identity?.name ?? null;

  const handleOpenPortal = useCallback(async () => {
    try {
      setOpeningPortal(true);
      setPortalError(null);
      const { url } = await authFetch<{ url: string }>(
        "/users/me/subscription/portal",
        { method: "POST" }
      );
      await open(url);
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Failed to open billing portal");
    } finally {
      setOpeningPortal(false);
    }
  }, []);

  return (
    <div>
      <Section title="Account">
        {authenticated ? (
          <>
            {userLabel && (
              <DisplayRow
                label="Signed in as"
                value={userLabel}
                valueClass="text-[12px] text-fg-2 truncate max-w-[180px]"
              />
            )}
            <DisplayRow
              label="Plan"
              value={TIER_LABELS[tier]}
              valueClass="text-[12px] text-accent font-semibold"
            />
            <ActionRow
              label=""
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

      {authenticated && tier !== "free" && (
        <Section title="Subscription">
          <div className="px-3 py-2 space-y-2">
            <ActionRow
              label="Manage billing, invoices & payment"
              action={openingPortal ? "Opening..." : "Manage Subscription"}
              actionClass="bg-accent/10 text-accent font-semibold hover:bg-accent/20"
              onClick={handleOpenPortal}
            />
            {portalError && (
              <span className="text-[11px] text-error px-1">{portalError}</span>
            )}
          </div>
        </Section>
      )}

      {authenticated && (
        <Section title="Your Plan">
          <TierLimitsTable tier={tier} />
          {tier !== "uplink_ultimate" && (
            <div className="px-3 pb-2">
              <button
                onClick={() => open("https://myscrollr.com/uplink")}
                className="w-full py-2 text-[11px] font-semibold rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                {tier === "free" ? "Upgrade to Uplink" : "Upgrade Plan"}
              </button>
            </div>
          )}
        </Section>
      )}

      <div className="flex items-center justify-end pt-2">
        <ResetButton label="Reset all settings" onClick={() => setConfirmReset(true)} />
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all settings?"
        description="This will set everything back to the original settings. Your account and saved content won't change."
        confirmLabel="Reset everything"
        destructive
        onConfirm={() => {
          setConfirmReset(false);
          onResetAll();
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

// ── Tier limits table ───────────────────────────────────────────

const LIMIT_ROWS: { label: string; key: keyof typeof TIER_LIMITS.free }[] = [
  { label: "Finance symbols", key: "symbols" },
  { label: "News feeds", key: "feeds" },
  { label: "Custom feeds", key: "customFeeds" },
  { label: "Sports leagues", key: "leagues" },
  { label: "Fantasy leagues", key: "fantasy" },
];

function TierLimitsTable({ tier }: { tier: SubscriptionTier }) {
  const limits = TIER_LIMITS[tier];
  return (
    <div className="px-3 py-1.5 space-y-1">
      {LIMIT_ROWS.map(({ label, key }) => (
        <div key={key} className="flex items-center justify-between py-1">
          <span className="text-[11px] text-fg-3">{label}</span>
          <span className="text-[11px] font-medium text-fg-2 tabular-nums">
            {isUnlimited(tier, key) ? "Unlimited" : limits[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
