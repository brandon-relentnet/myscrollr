/**
 * _template/DashboardTab.tsx — Scaffold for a new frontend DashboardTab integration.
 *
 * To create a new integration:
 *  1. Copy this directory to src/integrations/official/<yourname>/
 *  2. Find/replace "example" / "Example" with your integration's name
 *  3. Choose an icon from lucide-react
 *  4. Implement the configuration UI
 *  5. Export the IntegrationManifest
 *  6. Register in src/integrations/registry.ts (see bottom of this file)
 *
 * The DashboardTab is the configuration panel shown when a user selects
 * your integration in the dashboard sidebar. It receives the user's stream
 * data and callbacks for toggling visibility, deleting, and updating config.
 */

import { Puzzle } from 'lucide-react'
import type { IntegrationManifest, DashboardTabProps } from '../../types'
import { StreamHeader, InfoCard } from '../../shared'

// ─── Extra Props (optional) ──────────────────────────────────────
// If your integration needs additional props beyond the standard
// DashboardTabProps (e.g. OAuth state, external API data), define
// an interface and narrow extraProps in your component:
//
// interface ExampleExtraProps {
//   externalApiConnected: boolean
//   onConnect: () => void
// }
//
// Then in your component:
//   const extra = extraProps as ExampleExtraProps | undefined

// ─── DashboardTab Component ──────────────────────────────────────

function ExampleDashboardTab({
  stream,
  connected,
  onToggle,
  onDelete,
}: DashboardTabProps) {
  return (
    <div className="space-y-6">
      {/* Header with toggle and delete controls */}
      <StreamHeader
        stream={stream}
        icon={<Puzzle size={20} className="text-primary" />}
        title="Example Stream"
        subtitle="Brief description of your data source"
        connected={connected}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Info Cards — key metrics about this integration */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Data Source" value="Example API" />
        <InfoCard label="Items Tracked" value="0" />
        <InfoCard label="Update Frequency" value="60s" />
      </div>

      {/* About section */}
      <div className="bg-base-200/30 border border-base-300/30 rounded-lg p-5 space-y-3">
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          About This Stream
        </p>
        <p className="text-xs text-base-content/50 leading-relaxed">
          Describe what this integration does, where the data comes from,
          and what users can expect to see in their feed.
        </p>
      </div>

      {/* TODO: Add integration-specific configuration UI here */}
      {/* Examples:
          - Feed/source selection (like RSS category browser)
          - OAuth connection button (like Fantasy Yahoo connect)
          - Preference toggles
          - Item preview grid
      */}
    </div>
  )
}

// ─── Integration Manifest ────────────────────────────────────────

export const exampleIntegration: IntegrationManifest = {
  id: 'example',
  name: 'Example',
  tabLabel: 'Example',
  description: 'Brief description of this integration',
  icon: Puzzle,
  DashboardTab: ExampleDashboardTab,
}

// ─── Registration ────────────────────────────────────────────────
//
// Add the following to src/integrations/registry.ts:
//
//   import { exampleIntegration } from './official/example/DashboardTab'
//
//   register(exampleIntegration)
//
// And optionally add 'example' to TAB_ORDER if you want a fixed position:
//
//   export const TAB_ORDER = ['finance', 'sports', 'fantasy', 'rss', 'example'] as const
