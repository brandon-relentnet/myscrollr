import type { ChannelManifest } from './types'

// Convention-based discovery: scan channels/*/web/DashboardTab.tsx at build time.
// Each module must export a named `{name}Channel` conforming to ChannelManifest.
const modules = import.meta.glob<Record<string, ChannelManifest>>(
  '../../../channels/*/web/DashboardTab.tsx',
  { eager: true },
)

const channels = new Map<string, ChannelManifest>()

// Auto-register all discovered channels.
// Convention: each module exports `export const {id}Channel: ChannelManifest`.
for (const [, mod] of Object.entries(modules)) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      exportName.endsWith('Channel') &&
      value &&
      typeof value === 'object' &&
      'id' in value &&
      'DashboardTab' in value
    ) {
      channels.set(value.id, value)
    }
  }
}

/** Get a single channel by ID */
export function getChannel(id: string): ChannelManifest | undefined {
  return channels.get(id)
}

/** Get all registered channels */
export function getAllChannels(): ChannelManifest[] {
  return Array.from(channels.values())
}
