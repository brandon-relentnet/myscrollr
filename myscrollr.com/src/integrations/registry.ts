import type { IntegrationManifest } from './types'

// Convention-based discovery: scan integrations/*/web/DashboardTab.tsx at build time.
// Each module must export a named `{name}Integration` conforming to IntegrationManifest.
const modules = import.meta.glob<Record<string, IntegrationManifest>>(
  '../../../integrations/*/web/DashboardTab.tsx',
  { eager: true },
)

const integrations = new Map<string, IntegrationManifest>()

/** Canonical display order for integration tabs */
export const TAB_ORDER = ['finance', 'sports', 'fantasy', 'rss'] as const

// Auto-register all discovered integrations.
// Convention: each module exports `export const {id}Integration: IntegrationManifest`.
for (const [, mod] of Object.entries(modules)) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      exportName.endsWith('Integration') &&
      value &&
      typeof value === 'object' &&
      'id' in value &&
      'DashboardTab' in value
    ) {
      integrations.set(value.id, value)
    }
  }
}

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
