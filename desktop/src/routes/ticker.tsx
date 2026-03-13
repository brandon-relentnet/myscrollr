/**
 * Ticker route — consolidated ticker management.
 *
 * Combines: source toggles + Layout + Playback + Style settings.
 * Replaces the old Settings > Ticker tab.
 */
import { createFileRoute } from "@tanstack/react-router";
import RouteError from "../components/RouteError";
import { useShell } from "../shell-context";
import type { ChannelType } from "../api/client";
import type {
  AppearancePrefs,
  TickerPrefs,
  TickerRows,
  TickerGap,
  TickerMode,
  MixMode,
  ChipColorMode,
  TickerDirection,
  ScrollMode,
} from "../preferences";
import { resetCategory } from "../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "../components/settings/SettingsControls";
import { CHANNEL_ORDER } from "../channels/registry";
import { WIDGET_ORDER } from "../widgets/registry";

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute("/ticker")({
  component: TickerRoute,
  errorComponent: RouteError,
});

// ── Options ─────────────────────────────────────────────────────

const ROW_OPTIONS = [
  { value: "1", label: "Single" },
  { value: "2", label: "Double" },
  { value: "3", label: "Triple" },
];

const MODE_OPTIONS: { value: TickerMode; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfort", label: "Detailed" },
];

const GAP_OPTIONS: { value: TickerGap; label: string }[] = [
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Wide" },
];

const MIX_OPTIONS: { value: MixMode; label: string }[] = [
  { value: "grouped", label: "By source" },
  { value: "weave", label: "Mixed" },
  { value: "random", label: "Random" },
];

const COLOR_OPTIONS: { value: ChipColorMode; label: string }[] = [
  { value: "channel", label: "Colorful" },
  { value: "accent", label: "Theme" },
  { value: "muted", label: "Subtle" },
];

const DIRECTION_OPTIONS: { value: TickerDirection; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

const SCROLL_MODE_OPTIONS: { value: ScrollMode; label: string }[] = [
  { value: "continuous", label: "Continuous" },
  { value: "step", label: "Page" },
  { value: "flip", label: "Rotate" },
];

function speedLabel(speed: number): string {
  if (speed <= 15) return "Slowest";
  if (speed <= 30) return "Slow";
  if (speed <= 60) return "Normal";
  if (speed <= 100) return "Fast";
  return "Fastest";
}

// ── Component ───────────────────────────────────────────────────

function TickerRoute() {
  const shell = useShell();
  const { prefs, onPrefsChange, channels, allChannelManifests, allWidgets } = shell;
  const { appearance, ticker } = prefs;
  const enabledWidgets = prefs.widgets.enabledWidgets;

  const setTicker = <K extends keyof TickerPrefs>(
    key: K,
    value: TickerPrefs[K],
  ) => {
    onPrefsChange({ ...prefs, ticker: { ...ticker, [key]: value } });
  };

  const setAppearance = <K extends keyof AppearancePrefs>(
    key: K,
    value: AppearancePrefs[K],
  ) => {
    onPrefsChange({ ...prefs, appearance: { ...appearance, [key]: value } });
  };

  // Sort channels and widgets by canonical order
  const sortedChannels = [...channels]
    .filter((ch) => ch.enabled)
    .sort(
      (a, b) =>
        CHANNEL_ORDER.indexOf(a.channel_type) -
        CHANNEL_ORDER.indexOf(b.channel_type),
    );

  const sortedEnabledWidgets = enabledWidgets
    .map((id) => allWidgets.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => w != null)
    .sort(
      (a, b) => WIDGET_ORDER.indexOf(a.id) - WIDGET_ORDER.indexOf(b.id),
    );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Sources — which channels/widgets show on the ticker */}
      <Section title="Sources">
        {sortedChannels.length === 0 && sortedEnabledWidgets.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-fg-4 italic">
            No channels or widgets added yet
          </p>
        )}
        {sortedChannels.map((ch) => {
          const manifest = allChannelManifests.find(
            (m) => m.id === ch.channel_type,
          );
          return (
            <div key={ch.channel_type} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-base-250/50 transition-colors">
              <span
                className="flex items-center justify-center w-5 h-5 rounded-md shrink-0"
                style={{ backgroundColor: `${manifest?.hex}15`, color: manifest?.hex }}
              >
                {manifest?.icon && <manifest.icon size={12} />}
              </span>
              <span className="text-[12px] text-fg-2 flex-1">{manifest?.name ?? ch.channel_type}</span>
              <button
                type="button"
                role="switch"
                aria-checked={ch.visible}
                onClick={() => shell.onToggleChannelTicker(ch.channel_type as ChannelType, !ch.visible)}
                className="cursor-pointer"
              >
                <span
                  className="block h-4 w-7 rounded-full relative transition-colors"
                  style={{ background: ch.visible ? (manifest?.hex ?? "var(--color-accent)") : undefined }}
                >
                  {!ch.visible && (
                    <span className="absolute inset-0 rounded-full bg-fg-4/25" />
                  )}
                  <span
                    className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-200"
                    style={{ transform: ch.visible ? "translateX(12px)" : "translateX(0)" }}
                  />
                </span>
              </button>
            </div>
          );
        })}
        {sortedEnabledWidgets.map((widget) => {
          const isOnTicker = prefs.widgets.widgetsOnTicker.includes(widget.id);
          return (
            <div key={widget.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-base-250/50 transition-colors">
              <span
                className="flex items-center justify-center w-5 h-5 rounded-md shrink-0"
                style={{ backgroundColor: `${widget.hex}15`, color: widget.hex }}
              >
                <widget.icon size={12} />
              </span>
              <span className="text-[12px] text-fg-2 flex-1">{widget.name}</span>
              <button
                type="button"
                role="switch"
                aria-checked={isOnTicker}
                onClick={() => shell.onToggleWidgetTicker(widget.id)}
                className="cursor-pointer"
              >
                <span
                  className="block h-4 w-7 rounded-full relative transition-colors"
                  style={{ background: isOnTicker ? widget.hex : undefined }}
                >
                  {!isOnTicker && (
                    <span className="absolute inset-0 rounded-full bg-fg-4/25" />
                  )}
                  <span
                    className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-200"
                    style={{ transform: isOnTicker ? "translateX(12px)" : "translateX(0)" }}
                  />
                </span>
              </button>
            </div>
          );
        })}
      </Section>

      {/* Layout */}
      <Section title="Layout">
        <ToggleRow
          label="Show ticker"
          description="The scrolling bar that shows your updates"
          checked={ticker.showTicker}
          onChange={(v) => setTicker("showTicker", v)}
        />
        <SegmentedRow
          label="Rows"
          description="Show more than one row of scrolling items"
          value={String(appearance.tickerRows)}
          options={ROW_OPTIONS}
          onChange={(v) => setAppearance("tickerRows", Number(v) as TickerRows)}
        />
        <SegmentedRow
          label="Detail level"
          description="Detailed items are larger with more info"
          value={ticker.tickerMode}
          options={MODE_OPTIONS}
          onChange={(v) => setTicker("tickerMode", v)}
        />
      </Section>

      {/* Playback */}
      <Section title="Playback">
        <SegmentedRow
          label="Scroll mode"
          description="How items move through the ticker"
          value={ticker.scrollMode}
          options={SCROLL_MODE_OPTIONS}
          onChange={(v) => setTicker("scrollMode", v)}
        />
        <SliderRow
          label="Speed"
          description="How fast items scroll across the screen"
          value={ticker.tickerSpeed}
          min={5}
          max={150}
          step={5}
          displayValue={speedLabel(ticker.tickerSpeed)}
          onChange={(v) => setTicker("tickerSpeed", v)}
        />
        {ticker.scrollMode !== "flip" && (
          <SegmentedRow
            label="Direction"
            description="Which way the ticker scrolls"
            value={ticker.tickerDirection}
            options={DIRECTION_OPTIONS}
            onChange={(v) => setTicker("tickerDirection", v)}
          />
        )}
        {ticker.scrollMode !== "continuous" && (
          <SliderRow
            label="Pause"
            description="How long each set of items stays before moving"
            value={ticker.stepPause}
            min={1}
            max={10}
            step={0.5}
            displayValue={`${ticker.stepPause}s`}
            onChange={(v) => setTicker("stepPause", v)}
          />
        )}
        <ToggleRow
          label="Pause on hover"
          description={
            ticker.scrollMode === "continuous"
              ? "Slow the ticker when your mouse is over it"
              : "Pause when your mouse is over the ticker"
          }
          checked={ticker.pauseOnHover}
          onChange={(v) => setTicker("pauseOnHover", v)}
        />
        {ticker.scrollMode === "continuous" && ticker.pauseOnHover && (
          <SliderRow
            label="Mouse-over speed"
            description="How much the ticker slows when your mouse is over it"
            value={ticker.hoverSpeed}
            min={0}
            max={1}
            step={0.05}
            displayValue={
              ticker.hoverSpeed === 0
                ? "Pause"
                : `${Math.round(ticker.hoverSpeed * 100)}%`
            }
            onChange={(v) => setTicker("hoverSpeed", v)}
          />
        )}
      </Section>

      {/* Style */}
      <Section title="Style">
        <SegmentedRow
          label="Spacing"
          description="Space between ticker items"
          value={ticker.tickerGap}
          options={GAP_OPTIONS}
          onChange={(v) => setTicker("tickerGap", v)}
        />
        <SegmentedRow
          label="Item order"
          description="How items from different sources are arranged"
          value={ticker.mixMode}
          options={MIX_OPTIONS}
          onChange={(v) => setTicker("mixMode", v)}
        />
        <SegmentedRow
          label="Item colors"
          description="Color scheme for ticker items"
          value={ticker.chipColors}
          options={COLOR_OPTIONS}
          onChange={(v) => setTicker("chipColors", v)}
        />
      </Section>

      <div className="flex items-center gap-2 justify-end pt-2">
        <ResetButton
          label="Reset layout settings"
          onClick={() => onPrefsChange(resetCategory(prefs, "appearance"))}
        />
        <ResetButton
          label="Reset ticker settings"
          onClick={() => onPrefsChange(resetCategory(prefs, "ticker"))}
        />
      </div>
    </div>
  );
}
