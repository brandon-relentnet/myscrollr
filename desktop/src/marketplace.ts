// desktop/src/marketplace.ts

import type { ComponentType } from "react";
import type { SourceInfo } from "./types";
import type { SubscriptionTier } from "./auth";
import { getAllChannels } from "./channels/registry";
import { getAllWidgets } from "./widgets/registry";

// ── Types ───────────────────────────────────────────────────────

type IconProps = { size?: number; className?: string };

export type MarketplaceCategory = "data-feed" | "utility";

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<IconProps>;
  hex: string;
  category: MarketplaceCategory;
  kind: "channel" | "widget";
  info: SourceInfo;
  requiredTier: SubscriptionTier;
}

export const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  "data-feed": "Data Feeds",
  "utility": "Utilities",
};

// ── Tier requirements per source ────────────────────────────────

const CHANNEL_TIERS: Record<string, SubscriptionTier> = {
  finance: "free",
  sports: "free",
  rss: "free",
  fantasy: "uplink",
};

// ── Builder ─────────────────────────────────────────────────────

export function getMarketplaceItems(): MarketplaceItem[] {
  const channels: MarketplaceItem[] = getAllChannels().map((ch) => ({
    id: ch.id,
    name: ch.name,
    description: ch.description,
    icon: ch.icon,
    hex: ch.hex,
    category: "data-feed" as const,
    kind: "channel" as const,
    info: ch.info,
    requiredTier: CHANNEL_TIERS[ch.id] ?? "free",
  }));

  const widgets: MarketplaceItem[] = getAllWidgets().map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    icon: w.icon,
    hex: w.hex,
    category: "utility" as const,
    kind: "widget" as const,
    info: w.info,
    requiredTier: "free",
  }));

  return [...channels, ...widgets];
}
