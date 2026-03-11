/**
 * Desktop-local channel registry.
 *
 * Discovers channel FeedTab components at build time from this
 * directory. Each channel module exports a named `{id}Channel`
 * conforming to ChannelManifest.
 */
import type { ChannelManifest } from "../types";

// Convention-based discovery: scan channels/*/FeedTab.tsx at build time.
const modules = import.meta.glob<Record<string, ChannelManifest>>(
  "./*/FeedTab.tsx",
  { eager: true },
);

// ── Registry ─────────────────────────────────────────────────────

const channels = new Map<string, ChannelManifest>();

/** Canonical display order for channel tabs. */
const CHANNEL_ORDER = ["finance", "sports", "fantasy", "rss"] as const;

// Auto-register all discovered channels.
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

/** Get all registered channels. */
export function getAllChannels(): ChannelManifest[] {
  const known = (CHANNEL_ORDER as readonly string[])
    .filter((id) => channels.has(id))
    .map((id) => channels.get(id)!);
  const unknown = Array.from(channels.values())
    .filter((ch) => !(CHANNEL_ORDER as readonly string[]).includes(ch.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...known, ...unknown];
}


