/**
 * Desktop-local widget registry.
 *
 * Discovers widget FeedTab components at build time from this
 * directory only. Each widget module exports a named `{id}Widget`
 * conforming to WidgetManifest.
 */
import type { WidgetManifest } from "../types";

// Discover all widgets from this directory
const modules = import.meta.glob<Record<string, WidgetManifest>>(
  "./*/FeedTab.tsx",
  { eager: true },
);

// ── Registry ─────────────────────────────────────────────────────

const widgets = new Map<string, WidgetManifest>();

/** Canonical display order for widget tabs. */
export const WIDGET_ORDER: readonly string[] = ["clock", "weather", "sysmon", "uptime"];

// Auto-register all discovered widgets.
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

/** Get all registered widgets in canonical order. */
export function getAllWidgets(): WidgetManifest[] {
  const known = WIDGET_ORDER
    .filter((id) => widgets.has(id))
    .map((id) => widgets.get(id)!);
  const unknown = Array.from(widgets.values())
    .filter((w) => !WIDGET_ORDER.includes(w.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...known, ...unknown];
}
