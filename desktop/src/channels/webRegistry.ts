/**
 * Web channel registry — discovers DashboardTab components at build time.
 * Same pattern as myscrollr.com/src/channels/registry.ts but resolving
 * from the desktop project's perspective (../../channels/...).
 */
import type { ChannelManifest } from "@/channels/types";

const modules = import.meta.glob<Record<string, ChannelManifest>>(
  "../../../channels/*/web/DashboardTab.tsx",
  { eager: true },
);

const channels = new Map<string, ChannelManifest>();

for (const [, mod] of Object.entries(modules)) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      exportName.endsWith("Channel") &&
      value &&
      typeof value === "object" &&
      "id" in value &&
      "DashboardTab" in value
    ) {
      channels.set(value.id, value);
    }
  }
}

/** Get a single web channel by ID */
export function getWebChannel(id: string): ChannelManifest | undefined {
  return channels.get(id);
}

/** Get all registered web channels */
export function getAllWebChannels(): Array<ChannelManifest> {
  return Array.from(channels.values());
}
