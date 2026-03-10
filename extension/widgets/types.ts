import type { FeedTabProps } from "~/channels/types";

// ── Widget manifest — one per widget ─────────────────────────────
// Widgets are local utilities (clock, timer, weather, system monitor)
// with no backend. They share the feed tab UI surface with channels
// but have zero API/CDC involvement.

export interface WidgetManifest {
  /** Unique identifier (e.g. "clock", "timer"). Must not collide with channel IDs. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short label shown on the feed bar tab. */
  tabLabel: string;
  /** Brand hex color for the widget. */
  hex: string;
  /** When true, this widget only works in the desktop app (e.g. system monitor). */
  desktopOnly?: boolean;
  /** The React component rendered inside the feed bar for this widget. */
  FeedTab: React.ComponentType<FeedTabProps>;
}
