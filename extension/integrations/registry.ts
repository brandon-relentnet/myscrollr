import type { IntegrationManifest } from './types';

// Convention-based discovery: scan integrations/*/extension/FeedTab.tsx at build time.
// Each module must export a named `{id}Integration` conforming to IntegrationManifest.
const modules = import.meta.glob<Record<string, IntegrationManifest>>(
  '../../integrations/*/extension/FeedTab.tsx',
  { eager: true },
);

// ── Registry ─────────────────────────────────────────────────────

const integrations = new Map<string, IntegrationManifest>();

/** Canonical display order for integration tabs */
export const TAB_ORDER = ['finance', 'sports', 'fantasy', 'rss'] as const;

// Auto-register all discovered integrations.
// Convention: each module exports `export const {id}Integration: IntegrationManifest`.
for (const [, mod] of Object.entries(modules)) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      exportName.endsWith('Integration') &&
      value &&
      typeof value === 'object' &&
      'id' in value &&
      'FeedTab' in value
    ) {
      integrations.set(value.id, value);
    }
  }
}

/** Look up an integration by id. */
export function getIntegration(id: string): IntegrationManifest | undefined {
  return integrations.get(id);
}

/** Get all registered integrations in a stable order. */
export function getAllIntegrations(): IntegrationManifest[] {
  return Array.from(integrations.values());
}

/**
 * Sort a list of integration IDs into the canonical tab order.
 * Unknown IDs are appended alphabetically at the end.
 */
export function sortTabOrder(ids: string[]): string[] {
  const known = (TAB_ORDER as readonly string[]).filter((id) => ids.includes(id));
  const unknown = ids.filter((id) => !(TAB_ORDER as readonly string[]).includes(id)).sort();
  return [...known, ...unknown];
}
