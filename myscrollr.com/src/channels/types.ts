import type { Channel } from '@/api/client'

/** Props every DashboardTab component receives */
export interface DashboardTabProps {
  channel: Channel
  getToken: () => Promise<string | null>
  onToggle: () => void
  onDelete: () => void
  onChannelUpdate: (updated: Channel) => void
  /** SSE connection status */
  connected: boolean
  /** User's subscription tier: 'free' | 'uplink' | 'uplink_unlimited' */
  subscriptionTier: string
  /** Channel accent hex color (e.g. '#34d399') */
  hex: string
}

/** Manifest describing a single channel */
export interface ChannelManifest {
  /** Unique channel identifier (matches channel_type) */
  id: string
  /** Human-readable name */
  name: string
  /** Short label for sidebar tabs */
  tabLabel: string
  /** Brief description */
  description: string
  /** Channel accent hex color for icon badges, active states, and accents */
  hex: string
  /** Lucide icon component rendered at size 14 for sidebar, 20 for header */
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** Dashboard configuration panel component */
  DashboardTab: React.ComponentType<DashboardTabProps>
}
