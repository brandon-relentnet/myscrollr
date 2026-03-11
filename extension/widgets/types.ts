import type { FeedTabProps } from "~/channels/types";

// ── Widget manifest — one per widget ─────────────────────────────
// Widgets are local utilities (clock, weather, system monitor)
// with no backend. They share the feed tab UI surface with channels
// but have zero API/CDC involvement.

/** Structured info content for the Info tab */
export interface SourceInfo {
  /** What this source is and what it does */
  about: string;
  /** How to use it (rendered as bullet points) */
  usage: string[];
}

export interface WidgetManifest {
  /** Unique identifier (e.g. "clock", "weather"). Must not collide with channel IDs. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short label shown on the feed bar tab. */
  tabLabel: string;
  /** Brief description of the widget. */
  description: string;
  /** Brand hex color for the widget. */
  hex: string;
  /** Lucide icon component for sidebar and header display. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Info tab content — what this widget is and how to use it */
  info: SourceInfo;
  /** When true, this widget only works in the desktop app (e.g. system monitor). */
  desktopOnly?: boolean;
  /** The React component rendered inside the feed bar for this widget. */
  FeedTab: React.ComponentType<FeedTabProps>;
}
