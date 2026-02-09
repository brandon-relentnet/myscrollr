import type { IntegrationManifest } from './types'

// Official integrations
import { financeIntegration } from './official/finance/DashboardTab'
import { sportsIntegration } from './official/sports/DashboardTab'
import { fantasyIntegration } from './official/fantasy/DashboardTab'
import { rssIntegration } from './official/rss/DashboardTab'

const integrations = new Map<string, IntegrationManifest>()

/** Canonical display order for integration tabs */
export const TAB_ORDER = ['finance', 'sports', 'fantasy', 'rss'] as const

function register(manifest: IntegrationManifest) {
  integrations.set(manifest.id, manifest)
}

// Register official integrations
register(financeIntegration)
register(sportsIntegration)
register(fantasyIntegration)
register(rssIntegration)

/** Get a single integration by ID */
export function getIntegration(id: string): IntegrationManifest | undefined {
  return integrations.get(id)
}

/** Get all registered integrations */
export function getAllIntegrations(): IntegrationManifest[] {
  return Array.from(integrations.values())
}

/** Sort an array of integration IDs according to TAB_ORDER */
export function sortTabOrder(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ai = TAB_ORDER.indexOf(a as (typeof TAB_ORDER)[number])
    const bi = TAB_ORDER.indexOf(b as (typeof TAB_ORDER)[number])
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}
