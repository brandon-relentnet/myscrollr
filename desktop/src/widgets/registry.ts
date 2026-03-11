// Desktop widget registry — discovers widgets from the extension's
// widget directory plus any desktop-only widgets.
//
// Cross-platform widgets live in extension/widgets/<name>/FeedTab.tsx
// and are imported via the ~ alias. Desktop-only widgets (e.g.
// System Monitor) live in this directory.
import type { WidgetManifest } from "~/widgets/types";

// Import cross-platform widgets from extension (via ~ alias)
const extensionModules = import.meta.glob<Record<string, WidgetManifest>>(
  "../../../extension/widgets/*/FeedTab.tsx",
  { eager: true },
);

// Import desktop-only widgets from this directory
const desktopModules = import.meta.glob<Record<string, WidgetManifest>>(
  "./*/FeedTab.tsx",
  { eager: true },
);

// ── Registry ─────────────────────────────────────────────────────

const widgets = new Map<string, WidgetManifest>();

/** Canonical display order for widget tabs */
export const WIDGET_ORDER = ["clock", "weather", "sysmon"] as const;

// Auto-register all discovered widgets from both sources.
function registerModules(modules: Record<string, Record<string, WidgetManifest>>) {
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
}

registerModules(extensionModules);
registerModules(desktopModules);

/** Look up a widget by id. */
export function getWidget(id: string): WidgetManifest | undefined {
  return widgets.get(id);
}

/** Get all registered widgets. */
export function getAllWidgets(): WidgetManifest[] {
  // Return in canonical order, then unknowns alphabetically
  const known = (WIDGET_ORDER as readonly string[])
    .filter((id) => widgets.has(id))
    .map((id) => widgets.get(id)!);
  const unknown = Array.from(widgets.values())
    .filter((w) => !(WIDGET_ORDER as readonly string[]).includes(w.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...known, ...unknown];
}
