import type { Stream } from '@/api/client'

/** Props every DashboardTab component receives */
export interface DashboardTabProps {
  stream: Stream
  getToken: () => Promise<string | null>
  onToggle: () => void
  onDelete: () => void
  onStreamUpdate: (updated: Stream) => void
  /** SSE connection status */
  connected: boolean
}

/** Manifest describing a single integration */
export interface IntegrationManifest {
  /** Unique integration identifier (matches stream_type) */
  id: string
  /** Human-readable name */
  name: string
  /** Short label for sidebar tabs */
  tabLabel: string
  /** Brief description */
  description: string
  /** Lucide icon component rendered at size 14 for sidebar, 20 for header */
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** Dashboard configuration panel component */
  DashboardTab: React.ComponentType<DashboardTabProps>
}
