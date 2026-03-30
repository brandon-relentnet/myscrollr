import { ArrowUpRight } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { TIER_LABELS } from "../auth";
import type { SubscriptionTier } from "../auth";

interface UpgradePromptProps {
  /** Current item count (e.g. 5). Omit for features gated entirely (fantasy on free). */
  current?: number;
  /** Maximum allowed by the tier (e.g. 5). 0 means the feature is unavailable. */
  max: number;
  /** Plural noun for the feature ("symbols", "feeds", "leagues"). */
  noun: string;
  /** User's current tier, used for the label in the gated message. */
  tier: SubscriptionTier;
}

const UPGRADE_URL = "https://myscrollr.com/uplink";

export default function UpgradePrompt({
  current,
  max,
  noun,
  tier,
}: UpgradePromptProps) {
  const gated = max === 0;
  const tierLabel = TIER_LABELS[tier];

  const message = gated
    ? `${noun.charAt(0).toUpperCase() + noun.slice(1)} requires an Uplink subscription.`
    : `You've reached ${current ?? max}/${max} ${noun}. Upgrade for more.`;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-warn/10 border border-warn/20">
      <span className="text-xs text-warn leading-snug">{message}</span>
      <button
        onClick={() => open(UPGRADE_URL)}
        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-warn hover:text-fg transition-colors"
      >
        {gated ? `See plans` : `Upgrade from ${tierLabel}`}
        <ArrowUpRight className="w-3 h-3" />
      </button>
    </div>
  );
}
