import type { IntegrationManifest, FeedTabProps } from './types';

// Convention-based discovery: scan integrations/*/extension/FeedTab.tsx at build time.
// Each module default-exports a React FeedTab component.
const modules = import.meta.glob<{ default: React.ComponentType<FeedTabProps> }>(
  '../../integrations/*/extension/FeedTab.tsx',
  { eager: true },
);

// ── Metadata for discovered integrations ──────────────────────────
// Since glob-discovered modules only export a component, we define
// metadata separately keyed by integration ID (derived from the path).

interface IntegrationMeta {
  name: string;
  tabLabel: string;
  tier: 'official' | 'verified' | 'community';
}

const META: Record<string, IntegrationMeta> = {
  finance: { name: 'Finance', tabLabel: 'Finance', tier: 'official' },
  sports: { name: 'Sports', tabLabel: 'Sports', tier: 'official' },
  fantasy: { name: 'Fantasy', tabLabel: 'Fantasy', tier: 'official' },
  rss: { name: 'RSS', tabLabel: 'RSS', tier: 'official' },
};

// ── Registry ─────────────────────────────────────────────────────

const integrations = new Map<string, IntegrationManifest>();

for (const [path, mod] of Object.entries(modules)) {
  // Path looks like: ../../integrations/<id>/extension/FeedTab.tsx
  const match = path.match(/integrations\/([^/]+)\/extension\/FeedTab/);
  if (!match) continue;

  const id = match[1]!;
  const meta = META[id] ?? { name: id, tabLabel: id, tier: 'community' as const };

  integrations.set(id, {
    id,
    name: meta.name,
    tabLabel: meta.tabLabel,
    tier: meta.tier,
    FeedTab: mod.default,
  });
}

/** Look up an integration by id. */
export function getIntegration(id: string): IntegrationManifest | undefined {
  return integrations.get(id);
}

/** Get all registered integrations in a stable order. */
export function getAllIntegrations(): IntegrationManifest[] {
  return Array.from(integrations.values());
}

/** Stable tab order — official integrations always appear in this order. */
export const TAB_ORDER: readonly string[] = ['finance', 'sports', 'fantasy', 'rss'];

/**
 * Sort a list of integration IDs into the canonical tab order.
 * Unknown IDs are appended alphabetically at the end.
 */
export function sortTabOrder(ids: string[]): string[] {
  const known = TAB_ORDER.filter((id) => ids.includes(id));
  const unknown = ids.filter((id) => !TAB_ORDER.includes(id)).sort();
  return [...known, ...unknown];
}
