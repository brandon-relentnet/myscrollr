import type { ChannelManifest } from "./types";

// Convention-based discovery: scan integrations/*/extension/FeedTab.tsx at build time.
// Each module must export a named `{id}Channel` conforming to ChannelManifest.
const modules = import.meta.glob<Record<string, ChannelManifest>>(
  "../../integrations/*/extension/FeedTab.tsx",
  { eager: true },
);

// ── Registry ─────────────────────────────────────────────────────

const channels = new Map<string, ChannelManifest>();

/** Canonical display order for channel tabs */
export const TAB_ORDER = ["finance", "sports", "fantasy", "rss"] as const;

// Auto-register all discovered channels.
// Convention: each module exports `export const {id}Channel: ChannelManifest`.
for (const [, mod] of Object.entries(modules)) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      exportName.endsWith("Channel") &&
      value &&
      typeof value === "object" &&
      "id" in value &&
      "FeedTab" in value
    ) {
      channels.set(value.id, value);
    }
  }
}

/** Look up a channel by id. */
export function getChannel(id: string): ChannelManifest | undefined {
  return channels.get(id);
}

/**
 * Sort a list of channel IDs into the canonical tab order.
 * Unknown IDs are appended alphabetically at the end.
 */
export function sortTabOrder(ids: string[]): string[] {
  const known = (TAB_ORDER as readonly string[]).filter((id) =>
    ids.includes(id),
  );
  const unknown = ids
    .filter((id) => !(TAB_ORDER as readonly string[]).includes(id))
    .sort();
  return [...known, ...unknown];
}
