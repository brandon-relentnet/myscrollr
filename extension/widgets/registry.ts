import type { WidgetManifest } from "./types";

// Convention-based discovery: scan widgets/*/FeedTab.tsx at build time.
// Each module must export a named `{id}Widget` conforming to WidgetManifest.
const modules = import.meta.glob<Record<string, WidgetManifest>>(
  "./*/FeedTab.tsx",
  { eager: true },
);

// ── Registry ─────────────────────────────────────────────────────

const widgets = new Map<string, WidgetManifest>();

/** Canonical display order for widget tabs */
export const WIDGET_ORDER = ["clock", "timer", "weather", "sysmon"] as const;

// Auto-register all discovered widgets.
// Convention: each module exports `export const {id}Widget: WidgetManifest`.
for (const [, mod] of Object.entries(modules)) {
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      exportName.endsWith("Widget") &&
      value &&
      typeof value === "object" &&
      "id" in value &&
      "FeedTab" in value
    ) {
      widgets.set(value.id, value);
    }
  }
}

/** Look up a widget by id. */
export function getWidget(id: string): WidgetManifest | undefined {
  return widgets.get(id);
}

/** Get all registered widgets. */
export function getAllWidgets(): WidgetManifest[] {
  return Array.from(widgets.values());
}

/**
 * Sort a list of widget IDs into the canonical order.
 * Unknown IDs are appended alphabetically at the end.
 */
export function sortWidgetOrder(ids: string[]): string[] {
  const known = (WIDGET_ORDER as readonly string[]).filter((id) =>
    ids.includes(id),
  );
  const unknown = ids
    .filter((id) => !(WIDGET_ORDER as readonly string[]).includes(id))
    .sort();
  return [...known, ...unknown];
}
