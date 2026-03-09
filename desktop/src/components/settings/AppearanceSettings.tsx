import type {
  AppearancePrefs,
  TickerPrefs,
  Theme,
  TickerRows,
  TickerGap,
  TickerMode,
} from "../../preferences";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  SliderRow,
  ResetButton,
} from "./SettingsControls";

// ── Props ───────────────────────────────────────────────────────

interface AppearanceSettingsProps {
  appearance: AppearancePrefs;
  ticker: TickerPrefs;
  onAppearanceChange: (prefs: AppearancePrefs) => void;
  onTickerChange: (prefs: TickerPrefs) => void;
  onResetAppearance: () => void;
  onResetTicker: () => void;
}

// ── Options ─────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const SCALE_PRESETS: { value: string; label: string }[] = [
  { value: "85", label: "85%" },
  { value: "100", label: "100%" },
  { value: "115", label: "115%" },
  { value: "130", label: "130%" },
];

const ROW_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Single" },
  { value: "2", label: "Double" },
  { value: "3", label: "Triple" },
];

const MODE_OPTIONS: { value: TickerMode; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfort", label: "Comfort" },
];

const GAP_OPTIONS: { value: TickerGap; label: string }[] = [
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Wide" },
];

function speedLabel(speed: number): string {
  if (speed <= 20) return "Slow";
  if (speed <= 50) return "Normal";
  if (speed <= 80) return "Fast";
  return "Blazing";
}

// ── Component ───────────────────────────────────────────────────

export default function AppearanceSettings({
  appearance,
  ticker,
  onAppearanceChange,
  onTickerChange,
  onResetAppearance,
  onResetTicker,
}: AppearanceSettingsProps) {
  const setApp = <K extends keyof AppearancePrefs>(
    key: K,
    value: AppearancePrefs[K],
  ) => {
    onAppearanceChange({ ...appearance, [key]: value });
  };

  const setTicker = <K extends keyof TickerPrefs>(
    key: K,
    value: TickerPrefs[K],
  ) => {
    onTickerChange({ ...ticker, [key]: value });
  };

  return (
    <div>
      {/* Theme */}
      <Section title="Theme">
        <SegmentedRow
          label="Color mode"
          description="Switch between light and dark interface"
          value={appearance.theme}
          options={THEME_OPTIONS}
          onChange={(v) => setApp("theme", v)}
        />
      </Section>

      {/* Scale */}
      <Section title="Scale">
        <SegmentedRow
          label="Interface scale"
          description="Adjust the size of all UI elements"
          value={String(appearance.uiScale)}
          options={SCALE_PRESETS}
          onChange={(v) => setApp("uiScale", Number(v) as AppearancePrefs["uiScale"])}
        />
      </Section>

      {/* Ticker rows */}
      <Section title="Ticker layout">
        <SegmentedRow
          label="Rows"
          description="Stack multiple ticker strips for more data at a glance"
          value={String(appearance.tickerRows)}
          options={ROW_OPTIONS}
          onChange={(v) => setApp("tickerRows", Number(v) as TickerRows)}
        />
      </Section>

      {/* Ticker */}
      <Section title="Ticker">
        <ToggleRow
          label="Show ticker"
          description="Scrolling data strip above the taskbar"
          checked={ticker.showTicker}
          onChange={(v) => setTicker("showTicker", v)}
        />
        {ticker.showTicker && (
          <>
            <SegmentedRow
              label="Density"
              description="Comfort shows extra detail in a taller chip"
              value={ticker.tickerMode}
              options={MODE_OPTIONS}
              onChange={(v) => setTicker("tickerMode", v)}
            />
            <SliderRow
              label="Scroll speed"
              value={ticker.tickerSpeed}
              min={10}
              max={100}
              step={5}
              displayValue={speedLabel(ticker.tickerSpeed)}
              onChange={(v) => setTicker("tickerSpeed", v)}
            />
            <ToggleRow
              label="Pause on hover"
              description="Slow the ticker when your cursor is over it"
              checked={ticker.pauseOnHover}
              onChange={(v) => setTicker("pauseOnHover", v)}
            />
            {ticker.pauseOnHover && (
              <SliderRow
                label="Hover speed"
                description="How much the ticker slows on hover"
                value={ticker.hoverSpeed}
                min={0}
                max={0.8}
                step={0.05}
                displayValue={
                  ticker.hoverSpeed === 0
                    ? "Pause"
                    : `${Math.round(ticker.hoverSpeed * 100)}%`
                }
                onChange={(v) => setTicker("hoverSpeed", v)}
              />
            )}
            <SegmentedRow
              label="Gap"
              description="Space between ticker items"
              value={ticker.tickerGap}
              options={GAP_OPTIONS}
              onChange={(v) => setTicker("tickerGap", v)}
            />
          </>
        )}
      </Section>

      {/* Reset buttons */}
      <div className="flex items-center gap-2 justify-end pt-2">
        <ResetButton label="Reset appearance" onClick={onResetAppearance} />
        <ResetButton label="Reset ticker" onClick={onResetTicker} />
      </div>
    </div>
  );
}
