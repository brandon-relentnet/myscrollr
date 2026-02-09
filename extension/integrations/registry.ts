import type { IntegrationManifest } from './types';
import FinanceFeedTab from './official/finance/FeedTab';
import SportsFeedTab from './official/sports/FeedTab';
import RssFeedTab from './official/rss/FeedTab';

// ── Official integrations ────────────────────────────────────────

const finance: IntegrationManifest = {
  id: 'finance',
  name: 'Finance',
  tabLabel: 'Finance',
  tier: 'official',
  FeedTab: FinanceFeedTab,
};

const sports: IntegrationManifest = {
  id: 'sports',
  name: 'Sports',
  tabLabel: 'Sports',
  tier: 'official',
  FeedTab: SportsFeedTab,
};

const rss: IntegrationManifest = {
  id: 'rss',
  name: 'RSS',
  tabLabel: 'RSS',
  tier: 'official',
  FeedTab: RssFeedTab,
};

// ── Registry ─────────────────────────────────────────────────────

/** All registered integrations, keyed by id. */
const integrations = new Map<string, IntegrationManifest>([
  [finance.id, finance],
  [sports.id, sports],
  [rss.id, rss],
]);

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
