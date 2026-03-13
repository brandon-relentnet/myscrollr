/**
 * TickerSettings — ticker presentation settings.
 *
 * Controls how the ticker looks and behaves (layout, playback, style).
 * Source management (what data appears on the ticker) lives in each
 * channel/widget's own config tab, not here.
 */
import type {
  AppPreferences,
  AppearancePrefs,
  TickerPrefs,
  TickerRows,
  TickerGap,
  TickerMode,
  MixMode,
  ChipColorMode,
  TickerDirection,
  ScrollMode,
} from "../../preferences";
import { resetCategory } from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "./SettingsControls";

// ── Props ───────────────────────────────────────────────────────

interface TickerSettingsProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
}

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

export default function TickerSettings({
  prefs,
  onPrefsChange,
}: TickerSettingsProps) {
  const { appearance, ticker } = prefs;

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

  return (
    <div>
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
