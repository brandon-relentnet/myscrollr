/**
 * RSS display preferences — the "/channel/rss/display" page.
 *
 * Mirrors the Finance/Sports DisplayPanel shape (2026-05-09 IA refactor):
 *   1. Live preview        — sample article on the Feed and a chip on
 *                            the Ticker, side by side. Both update in
 *                            real time as the toggles change.
 *   2. Display items grid  — shared `DisplayItemsGrid` widget with
 *                            column-headers-as-bulk-toggles.
 *   3. Feed behavior       — `articlesPerSource` segmented row
 *                            (structural, not a Venue toggle).
 *   4. Footer reset        — restore defaults.
 *
 * Sample article selection:
 *   1. Prefer the user's first dashboard article so the preview shows
 *      something they recognise
 *   2. Fall back to a hardcoded sample (a fictional tech newsletter
 *      article) so the preview always has content
 *
 * Persisted shape unchanged: `Venue` enum (off|feed|ticker|both)
 * converted at the UI boundary via the shared `DisplayItemsGrid`.
 */
import { useMemo } from "react";
import { Eye, Tv } from "lucide-react";
import { clsx } from "clsx";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions } from "../../api/queries";
import { useShell } from "../../shell-context";
import type { RssItem } from "../../types";
import type { RssDisplayPrefs, Venue } from "../../preferences";
import { useNow } from "../../hooks/useNow";
import { relativeTime, truncate } from "../../utils/format";
import RssChip from "../../components/chips/RssChip";
import DisplayItemsGrid from "../../components/settings/DisplayItemsGrid";
import type { DisplayItemsSection } from "../../components/settings/DisplayItemsGrid";
import {
  Section,
  SegmentedRow,
  ResetButton,
} from "../../components/settings/SettingsControls";

// ── Constants ────────────────────────────────────────────────────

const DEFAULTS: RssDisplayPrefs = {
  showDescription: "both",
  showSource: "both",
  showTimestamps: "both",
  articlesPerSource: 4,
};

const ARTICLES_PER_SOURCE_OPTIONS = [
  { value: "2", label: "2" },
  { value: "4", label: "4" },
  { value: "6", label: "6" },
  { value: "10", label: "10" },
  { value: "0", label: "All" },
];

// Hardcoded sample article. Used when the user has no feeds yet (or
// the dashboard hasn't loaded). Plausible-looking tech newsletter
// content with non-trivial title length so truncation behavior is
// visible in compact mode.
function buildSampleArticle(): RssItem {
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
  return {
    id: -1,
    feed_url: "https://example.com/feed.xml",
    guid: "preview-sample",
    title: "WebKit ships native CSS scroll-driven animations in Safari 26",
    link: "",
    description:
      "Apple's browser team landed support for the View Timeline API, " +
      "letting developers tie keyframe progress directly to scroll position " +
      "without JavaScript. The implementation matches the Chromium build.",
    source_name: "TechCrunch",
    published_at: tenMinutesAgo,
    created_at: tenMinutesAgo,
    updated_at: tenMinutesAgo,
  };
}

// ── Component ────────────────────────────────────────────────────

export default function RssDisplayPanel() {
  const { prefs, onPrefsChange } = useShell();
  const dp = prefs.channelDisplay.rss;

  // Pull a real article from the dashboard so the preview shows
  // something the user recognises. Falls back to the sample.
  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const previewItem: RssItem = useMemo(() => {
    const items = (dashboard?.data?.rss as RssItem[] | undefined) ?? [];
    if (items.length > 0) return items[0];
    return buildSampleArticle();
  }, [dashboard?.data?.rss]);

  // ── Patch helpers ──────────────────────────────────────────────

  function patch(next: Partial<RssDisplayPrefs>) {
    onPrefsChange({
      ...prefs,
      channelDisplay: {
        ...prefs.channelDisplay,
        rss: { ...dp, ...next },
      },
    });
  }

  function applyDisplayChanges(changes: Record<string, Venue>) {
    patch(changes as Partial<RssDisplayPrefs>);
  }

  function setArticlesPerSource(value: string) {
    patch({ articlesPerSource: Number(value) });
  }

  function handleReset() {
    patch(DEFAULTS);
  }

  // ── Booleans the preview reads from ───────────────────────────

  const feedShowDescription = isOn(dp.showDescription, "feed");
  const feedShowSource = isOn(dp.showSource, "feed");
  const feedShowTimestamps = isOn(dp.showTimestamps, "feed");
  const tickerShowSource = isOn(dp.showSource, "ticker");
  const tickerShowTimestamps = isOn(dp.showTimestamps, "ticker");

  // ── Display-items grid model ──────────────────────────────────

  const sections: DisplayItemsSection[] = [
    {
      rows: [
        {
          key: "showDescription",
          label: "Article description",
          description: "Snippet beneath the headline (Feed only)",
          value: dp.showDescription,
        },
        {
          key: "showSource",
          label: "Source name",
          description: "Publisher / feed name",
          value: dp.showSource,
        },
        {
          key: "showTimestamps",
          label: "Timestamps",
          description: "Relative publish time on each item",
          value: dp.showTimestamps,
        },
      ],
    },
  ];

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      {/* ── Live preview ─────────────────────────────────────────── */}
      <Section title="Live preview">
        <div className="px-3 pb-1 space-y-3">
          <p className="text-[11px] text-fg-4 leading-snug">
            Toggle items below to see the Feed article and Ticker chip
            update in real time.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <PreviewSurface label="Feed" icon={Eye}>
              <RssFeedPreview
                item={previewItem}
                showDescription={feedShowDescription}
                showSource={feedShowSource}
                showTimestamps={feedShowTimestamps}
              />
            </PreviewSurface>
            <PreviewSurface label="Ticker" icon={Tv}>
              <RssTickerPreview
                item={previewItem}
                showSource={tickerShowSource}
                showTimestamps={tickerShowTimestamps}
              />
            </PreviewSurface>
          </div>
        </div>
      </Section>

      {/* ── Display items grid ───────────────────────────────────── */}
      <DisplayItemsGrid sections={sections} onChange={applyDisplayChanges} />

      {/* ── Feed behavior ────────────────────────────────────────── */}
      <Section title="Feed behavior">
        <SegmentedRow
          label="Articles per source"
          description="Limit how many articles appear from each feed"
          value={String(dp.articlesPerSource)}
          options={ARTICLES_PER_SOURCE_OPTIONS}
          onChange={setArticlesPerSource}
        />
      </Section>

      {/* ── Footer reset ─────────────────────────────────────────── */}
      <div className="flex items-center justify-end pt-2">
        <ResetButton label="Reset display settings" onClick={handleReset} />
      </div>
    </div>
  );
}

// Local helper: read a single Venue's surface boolean. Inlined to
// avoid an extra import dance — every preview component does the
// same conversion.
function isOn(venue: Venue, surface: "feed" | "ticker"): boolean {
  if (venue === "both") return true;
  return venue === surface;
}

// ── Preview surface card ────────────────────────────────────────

interface PreviewSurfaceProps {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}

function PreviewSurface({ label, icon: Icon, children }: PreviewSurfaceProps) {
  return (
    <div className="rounded-lg border border-edge/40 bg-base-200/40 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-edge/40 bg-surface-2/30">
        <Icon size={11} className="text-fg-4" />
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-fg-4">
          {label}
        </span>
      </div>
      <div className="p-2.5 min-h-[88px] flex items-center justify-center overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ── Feed preview — mini comfort article row ─────────────────────
//
// Doesn't reuse the production `RssArticle` because that component
// is link-anchored (`<a>` with target="_blank") and renders inside
// a strict grid layout. The preview wants a dense, click-inert
// representation that still respects the same visibility prefs.

interface RssFeedPreviewProps {
  item: RssItem;
  showDescription: boolean;
  showSource: boolean;
  showTimestamps: boolean;
}

function RssFeedPreview({
  item,
  showDescription,
  showSource,
  showTimestamps,
}: RssFeedPreviewProps) {
  const now = useNow();
  const ago = showTimestamps
    ? relativeTime(item.published_at, now)
    : null;

  return (
    <motion.div
      key={`${showDescription}-${showSource}-${showTimestamps}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
      className={clsx(
        "w-full px-3 py-2 bg-surface rounded-md border-l-2 border-l-accent/30",
      )}
    >
      <span className="block text-[12px] font-medium text-fg leading-snug line-clamp-2">
        {item.title}
      </span>
      {showDescription && item.description && (
        <p className="mt-1 text-[11px] text-fg-2 leading-relaxed line-clamp-2">
          {truncate(item.description, 140)}
        </p>
      )}
      {(showSource || ago) && (
        <div className="flex items-center gap-1.5 mt-1.5">
          {showSource && (
            <span className="text-[9px] font-mono font-bold text-accent/80 uppercase tracking-wider">
              {item.source_name}
            </span>
          )}
          {showSource && ago && (
            <span className="text-fg-4 text-[9px]" aria-hidden>
              &middot;
            </span>
          )}
          {ago && (
            <span className="text-[9px] font-mono text-fg-4 tabular-nums">
              {ago}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Ticker preview — a real RssChip ─────────────────────────────

interface RssTickerPreviewProps {
  item: RssItem;
  showSource: boolean;
  showTimestamps: boolean;
}

function RssTickerPreview({
  item,
  showSource,
  showTimestamps,
}: RssTickerPreviewProps) {
  return (
    <RssChip
      item={item}
      comfort={false}
      colorMode="channel"
      showSource={showSource}
      showTimestamps={showTimestamps}
    />
  );
}
