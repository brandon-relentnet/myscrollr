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
} from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "./SettingsControls";

// ── Props ───────────────────────────────────────────────────────

interface TickerSettingsProps {
  appearance: AppearancePrefs;
  ticker: TickerPrefs;
  onAppearanceChange: (prefs: AppearancePrefs) => void;
  onTickerChange: (prefs: TickerPrefs) => void;
  onResetAppearance: () => void;
  onResetTicker: () => void;
}

// ── Options ─────────────────────────────────────────────────────

const ROW_OPTIONS: { value: string; label: string }[] = [
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
  { value: "grouped", label: "Grouped" },
  { value: "weave", label: "Mixed" },
  { value: "random", label: "Random" },
];

const COLOR_OPTIONS: { value: ChipColorMode; label: string }[] = [
  { value: "channel", label: "Channel" },
  { value: "accent", label: "Accent" },
  { value: "muted", label: "Muted" },
];

const DIRECTION_OPTIONS: { value: TickerDirection; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

const SCROLL_MODE_OPTIONS: { value: ScrollMode; label: string }[] = [
  { value: "continuous", label: "Continuous" },
  { value: "step", label: "Step" },
  { value: "flip", label: "Flip" },
];

function speedLabel(speed: number): string {
  if (speed <= 15) return "Crawl";
  if (speed <= 30) return "Slow";
  if (speed <= 60) return "Normal";
  if (speed <= 100) return "Fast";
  return "Blazing";
}

// ── Component ───────────────────────────────────────────────────

export default function TickerSettings({
  appearance,
  ticker,
  onAppearanceChange,
  onTickerChange,
  onResetAppearance,
  onResetTicker,
}: TickerSettingsProps) {
  const setTicker = <K extends keyof TickerPrefs>(
    key: K,
    value: TickerPrefs[K],
  ) => {
    onTickerChange({ ...ticker, [key]: value });
  };

  return (
    <div>
      <Section title="Layout">
        <ToggleRow
          label="Show ticker"
          description="Scrolling data strip above the taskbar"
          checked={ticker.showTicker}
          onChange={(v) => setTicker("showTicker", v)}
        />
        <SegmentedRow
          label="Rows"
          description="Stack multiple ticker strips for more data at a glance"
          value={String(appearance.tickerRows)}
          options={ROW_OPTIONS}
          onChange={(v) => onAppearanceChange({ ...appearance, tickerRows: Number(v) as TickerRows })}
        />
        <SegmentedRow
          label="Density"
          description="Detailed shows extra info in a taller chip"
          value={ticker.tickerMode}
          options={MODE_OPTIONS}
          onChange={(v) => setTicker("tickerMode", v)}
        />
      </Section>

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
            description="How long to wait between transitions"
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
              ? "Slow the ticker when your cursor is over it"
              : "Pause transitions when your cursor is over the ticker"
          }
          checked={ticker.pauseOnHover}
          onChange={(v) => setTicker("pauseOnHover", v)}
        />
        {ticker.scrollMode === "continuous" && ticker.pauseOnHover && (
          <SliderRow
            label="Hover speed"
            description="How much the ticker slows on hover"
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

      <Section title="Style">
        <SegmentedRow
          label="Gap"
          description="Space between ticker items"
          value={ticker.tickerGap}
          options={GAP_OPTIONS}
          onChange={(v) => setTicker("tickerGap", v)}
        />
        <SegmentedRow
          label="Item order"
          description="How items from different channels are mixed"
          value={ticker.mixMode}
          options={MIX_OPTIONS}
          onChange={(v) => setTicker("mixMode", v)}
        />
        <SegmentedRow
          label="Chip colors"
          description="Color scheme for ticker items"
          value={ticker.chipColors}
          options={COLOR_OPTIONS}
          onChange={(v) => setTicker("chipColors", v)}
        />
      </Section>

      <div className="flex items-center gap-2 justify-end pt-2">
        <ResetButton label="Reset layout" onClick={onResetAppearance} />
        <ResetButton label="Reset ticker" onClick={onResetTicker} />
      </div>
    </div>
  );
}
