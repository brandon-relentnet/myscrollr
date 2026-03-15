/**
 * Ticker route — dedicated page for ticker presentation settings.
 *
 * Features a live preview strip at the top that responds to every
 * setting change in real-time, visual card selectors for layout and
 * style options, and a collapsible advanced section for rarely-used
 * controls.
 *
 * Replaces the old Ticker tab inside /settings.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Ticker } from "motion-plus/react";
import { motion, AnimatePresence, useMotionValue, animate } from "motion/react";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import RouteError from "../components/RouteError";
import { useShell } from "../shell-context";
import { resetCategory } from "../preferences";
import { ResetButton } from "../components/settings/SettingsControls";
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
} from "../preferences";

// ── Route ───────────────────────────────────────────────────────

export const Route = createFileRoute("/ticker")({
  component: TickerRoute,
  errorComponent: RouteError,
});

// ── Sample chip data for the live preview ───────────────────────

interface SampleChip {
  label: string;
  value: string;
  detail?: string;
  color: string;
  textColor: string;
  borderColor: string;
}

const SAMPLE_CHIPS: SampleChip[] = [
  // Finance (4)
  { label: "FINANCE", value: "Symbol \u00B7 Price", detail: "Exchange \u00B7 Change %", color: "bg-primary/[0.06]", textColor: "text-primary", borderColor: "ring-primary/25" },
  { label: "FINANCE", value: "Ticker \u00B7 Change", detail: "Sector \u00B7 Market Cap", color: "bg-primary/[0.06]", textColor: "text-primary", borderColor: "ring-primary/25" },
  { label: "FINANCE", value: "Index \u00B7 Value", detail: "Day High \u00B7 Day Low", color: "bg-primary/[0.06]", textColor: "text-primary", borderColor: "ring-primary/25" },
  { label: "FINANCE", value: "Crypto \u00B7 Price", detail: "24h Vol \u00B7 Change %", color: "bg-primary/[0.06]", textColor: "text-primary", borderColor: "ring-primary/25" },
  // Sports (4)
  { label: "SPORTS", value: "Team vs Team", detail: "League \u00B7 Game Time", color: "bg-secondary/[0.06]", textColor: "text-secondary", borderColor: "ring-secondary/25" },
  { label: "SPORTS", value: "Score \u00B7 Status", detail: "Quarter \u00B7 Time Left", color: "bg-secondary/[0.06]", textColor: "text-secondary", borderColor: "ring-secondary/25" },
  { label: "SPORTS", value: "Team \u00B7 Record", detail: "Conference \u00B7 Rank", color: "bg-secondary/[0.06]", textColor: "text-secondary", borderColor: "ring-secondary/25" },
  { label: "SPORTS", value: "Final \u00B7 Score", detail: "Highlights \u00B7 Recap", color: "bg-secondary/[0.06]", textColor: "text-secondary", borderColor: "ring-secondary/25" },
  // RSS (4)
  { label: "RSS", value: "Article Headline", detail: "Source \u00B7 Time Ago", color: "bg-info/[0.06]", textColor: "text-info", borderColor: "ring-info/25" },
  { label: "RSS", value: "News Title", detail: "Feed Name \u00B7 Published", color: "bg-info/[0.06]", textColor: "text-info", borderColor: "ring-info/25" },
  { label: "RSS", value: "Blog Post Title", detail: "Author \u00B7 Read Time", color: "bg-info/[0.06]", textColor: "text-info", borderColor: "ring-info/25" },
  { label: "RSS", value: "Breaking News", detail: "Category \u00B7 Just Now", color: "bg-info/[0.06]", textColor: "text-info", borderColor: "ring-info/25" },
  // Fantasy (4)
  { label: "FANTASY", value: "Player \u00B7 Points", detail: "Position \u00B7 Team", color: "bg-accent-purple/[0.06]", textColor: "text-accent-purple", borderColor: "ring-accent-purple/25" },
  { label: "FANTASY", value: "Matchup \u00B7 Score", detail: "Week \u00B7 Standing", color: "bg-accent-purple/[0.06]", textColor: "text-accent-purple", borderColor: "ring-accent-purple/25" },
  { label: "FANTASY", value: "Roster \u00B7 Projected", detail: "Bench \u00B7 Waiver", color: "bg-accent-purple/[0.06]", textColor: "text-accent-purple", borderColor: "ring-accent-purple/25" },
  { label: "FANTASY", value: "Trade \u00B7 Offer", detail: "Deadline \u00B7 Status", color: "bg-accent-purple/[0.06]", textColor: "text-accent-purple", borderColor: "ring-accent-purple/25" },
  // Weather (1)
  { label: "WEATHER", value: "Location \u00B7 Temp", detail: "Condition \u00B7 Feels Like", color: "bg-widget-weather/[0.06]", textColor: "text-widget-weather", borderColor: "ring-widget-weather/25" },
  // Sysmon (1)
  { label: "SYSMON", value: "CPU \u00B7 Usage %", detail: "Frequency \u00B7 Temp", color: "bg-widget-sysmon/[0.06]", textColor: "text-widget-sysmon", borderColor: "ring-widget-sysmon/25" },
  // GitHub (1)
  { label: "GITHUB", value: "Repo \u00B7 CI Status", detail: "Workflow \u00B7 Time Ago", color: "bg-widget-github/[0.06]", textColor: "text-widget-github", borderColor: "ring-widget-github/25" },
  // Uptime (1)
  { label: "UPTIME", value: "Monitor \u00B7 Uptime %", detail: "Status \u00B7 Last Checked", color: "bg-widget-uptime/[0.06]", textColor: "text-widget-uptime", borderColor: "ring-widget-uptime/25" },
];

const MUTED_OVERRIDE = {
  color: "bg-fg/[0.03]",
  textColor: "text-fg-2",
  borderColor: "ring-fg/10",
};

const ACCENT_OVERRIDE = {
  color: "bg-primary/[0.06]",
  textColor: "text-primary",
  borderColor: "ring-primary/25",
};

// ── Chip ordering for preview ───────────────────────────────────

/** Group chips by their label (source), then round-robin interleave. */
function weaveChips(chips: SampleChip[]): SampleChip[] {
  const groups: Record<string, SampleChip[]> = {};
  for (const chip of chips) {
    (groups[chip.label] ??= []).push(chip);
  }
  const buckets = Object.values(groups);
  if (buckets.length === 0) return [];
  const result: SampleChip[] = [];
  const maxLen = Math.max(...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (i < bucket.length) result.push(bucket[i]);
    }
  }
  return result;
}

function orderChips(chips: SampleChip[], mode: MixMode): SampleChip[] {
  return mode === "weave" ? weaveChips(chips) : chips;
}

// ── Advanced options ────────────────────────────────────────────

const SCROLL_MODE_OPTIONS: { value: ScrollMode; label: string }[] = [
  { value: "continuous", label: "Continuous" },
  { value: "step", label: "Page" },
  { value: "flip", label: "Rotate" },
];

const DIRECTION_OPTIONS: { value: TickerDirection; label: string }[] = [
  { value: "left", label: "\u2190 Left" },
  { value: "right", label: "Right \u2192" },
];

const MIX_OPTIONS: { value: MixMode; label: string }[] = [
  { value: "grouped", label: "By source" },
  { value: "weave", label: "Mixed" },
];

// ── Component ───────────────────────────────────────────────────

function TickerRoute() {
  const shell = useShell();
  const { prefs, onPrefsChange } = shell;
  const { appearance, ticker } = prefs;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const setTicker = useCallback(<K extends keyof TickerPrefs>(key: K, value: TickerPrefs[K]) => {
    onPrefsChange({ ...prefs, ticker: { ...ticker, [key]: value } });
  }, [prefs, ticker, onPrefsChange]);

  const setAppearance = useCallback(<K extends keyof AppearancePrefs>(key: K, value: AppearancePrefs[K]) => {
    onPrefsChange({ ...prefs, appearance: { ...appearance, [key]: value } });
  }, [prefs, appearance, onPrefsChange]);

  const handleReset = useCallback(() => {
    let next: AppPreferences = resetCategory(prefs, "ticker");
    next = resetCategory(next, "appearance");
    onPrefsChange(next);
  }, [prefs, onPrefsChange]);

  // Compute preview params — reflect all settings
  const velocity = ticker.tickerDirection === "right" ? ticker.tickerSpeed : -ticker.tickerSpeed;
  const gapPx = ticker.tickerGap === "tight" ? 8 : ticker.tickerGap === "spacious" ? 20 : 12;
  const comfort = ticker.tickerMode === "comfort";
  // Row height is dynamic — let content size naturally, no fixed height.

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h2 className="text-[13px] font-mono font-semibold text-fg-4 uppercase tracking-wider">
          Ticker
        </h2>
        <button
          onClick={() => setTicker("showTicker", !ticker.showTicker)}
          className={clsx(
            "relative w-9 h-5 rounded-full transition-colors",
            ticker.showTicker ? "bg-accent" : "bg-base-350",
          )}
          aria-label={ticker.showTicker ? "Disable ticker" : "Enable ticker"}
        >
          <div
            className={clsx(
              "absolute top-[3px] left-[3px] h-3.5 w-3.5 rounded-full transition-transform duration-200",
              ticker.showTicker
                ? "translate-x-[16px] bg-surface"
                : "translate-x-0 bg-fg-3",
            )}
          />
        </button>
      </div>

      {/* ── Live Preview ────────────────────────────────────────── */}
      <div className="px-6 pb-5">
        <motion.div
          layout="size"
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          className={clsx(
            "rounded-xl border border-edge/50 bg-base-150 overflow-hidden relative py-1",
            !ticker.showTicker && "opacity-30 pointer-events-none",
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent z-10" />
          {Array.from({ length: appearance.tickerRows }, (_, rowIdx) => {
            const orderedChips = orderChips(SAMPLE_CHIPS, ticker.mixMode);
            const rowChips = orderedChips.filter((_, i) =>
              appearance.tickerRows <= 1 ? true : i % appearance.tickerRows === rowIdx
            );
            return (
              <div
                key={`row-${rowIdx}-${appearance.tickerRows}`}
                className={clsx(
                  "flex items-center relative",
                  rowIdx > 0 && "border-t border-edge/30",
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${ticker.scrollMode}-${ticker.tickerDirection}-${ticker.mixMode}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="w-full"
                  >
                    <PreviewRow
                      chips={rowChips}
                      comfort={comfort}
                      colorMode={ticker.chipColors}
                      scrollMode={ticker.scrollMode}
                      speed={ticker.tickerSpeed}
                      direction={ticker.tickerDirection}
                      stepPause={ticker.stepPause}
                      pauseOnHover={ticker.pauseOnHover}
                      hoverSpeed={ticker.hoverSpeed}
                      gap={gapPx}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* ── Settings ────────────────────────────────────────────── */}
      <motion.div layout="position" transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }} className="px-6 pb-6 space-y-6 max-w-2xl mx-auto w-full">

        {/* ── Layout ──────────────────────────────────────────── */}
        <SettingGroup label="Layout">
          {/* Rows */}
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((n) => (
              <VisualCard
                key={n}
                selected={appearance.tickerRows === n}
                onClick={() => setAppearance("tickerRows", n as TickerRows)}
                label={`${n} Row${n > 1 ? "s" : ""}`}
              >
                <div className="flex flex-col gap-1 w-full">
                  {Array.from({ length: n }, (_, i) => (
                    <div key={i} className="flex gap-1">
                      <div className={clsx("h-1.5 rounded-[2px] flex-1", appearance.tickerRows === n ? "bg-accent/50" : "bg-fg-4/20")} />
                      <div className={clsx("h-1.5 rounded-[2px] w-2/5", appearance.tickerRows === n ? "bg-accent/30" : "bg-fg-4/10")} />
                      <div className={clsx("h-1.5 rounded-[2px] flex-1", appearance.tickerRows === n ? "bg-accent/40" : "bg-fg-4/15")} />
                    </div>
                  ))}
                </div>
              </VisualCard>
            ))}
          </div>

          {/* Detail level */}
          <div className="flex gap-2 mt-2">
            <VisualCard
              selected={ticker.tickerMode === "compact"}
              onClick={() => setTicker("tickerMode", "compact")}
              label="Compact"
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className={clsx("text-[9px] font-mono font-semibold uppercase tracking-wider", ticker.tickerMode === "compact" ? "text-accent/60" : "text-fg-4/40")}>AAPL</span>
                <span className={clsx("text-[10px] font-mono", ticker.tickerMode === "compact" ? "text-accent" : "text-fg-4/60")}>{"\u25B2"} 2.4%</span>
              </div>
            </VisualCard>
            <VisualCard
              selected={ticker.tickerMode === "comfort"}
              onClick={() => setTicker("tickerMode", "comfort")}
              label="Detailed"
            >
              <div className="flex flex-col gap-0.5 w-full">
                <div className="flex items-center gap-1.5">
                  <span className={clsx("text-[9px] font-mono font-semibold uppercase tracking-wider", ticker.tickerMode === "comfort" ? "text-accent/60" : "text-fg-4/40")}>AAPL</span>
                  <span className={clsx("text-[10px] font-mono", ticker.tickerMode === "comfort" ? "text-accent" : "text-fg-4/60")}>{"\u25B2"} 2.4%</span>
                </div>
                <span className={clsx("text-[8px] font-mono", ticker.tickerMode === "comfort" ? "text-accent/40" : "text-fg-4/20")}>Tech {"\u00B7"} $182.50</span>
              </div>
            </VisualCard>
          </div>
        </SettingGroup>

        {/* ── Speed ───────────────────────────────────────────── */}
        <SettingGroup label="Speed">
          <SpeedSlider
            value={ticker.tickerSpeed}
            onChange={(v) => setTicker("tickerSpeed", v)}
          />
        </SettingGroup>

        {/* ── Style ───────────────────────────────────────────── */}
        <SettingGroup label="Style">
          {/* Spacing */}
          <div className="flex gap-2">
            {(["tight", "normal", "spacious"] as const).map((gap) => {
              const gapLabel = gap === "tight" ? "Tight" : gap === "normal" ? "Normal" : "Wide";
              const gapSize = gap === "tight" ? "gap-0.5" : gap === "normal" ? "gap-1.5" : "gap-3";
              return (
                <VisualCard
                  key={gap}
                  selected={ticker.tickerGap === gap}
                  onClick={() => setTicker("tickerGap", gap as TickerGap)}
                  label={gapLabel}
                >
                  <div className={clsx("flex items-center w-full", gapSize)}>
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={clsx(
                          "h-3 rounded-[2px] flex-1",
                          ticker.tickerGap === gap ? "bg-accent/40" : "bg-fg-4/15",
                        )}
                      />
                    ))}
                  </div>
                </VisualCard>
              );
            })}
          </div>

          {/* Colors */}
          <div className="flex gap-2 mt-2">
            <VisualCard
              selected={ticker.chipColors === "channel"}
              onClick={() => setTicker("chipColors", "channel")}
              label="Colorful"
            >
              <div className="flex items-center gap-1 w-full">
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                <div className="w-2.5 h-2.5 rounded-full bg-secondary" />
                <div className="w-2.5 h-2.5 rounded-full bg-info" />
                <div className="w-2.5 h-2.5 rounded-full bg-accent-purple" />
                <div className="w-2.5 h-2.5 rounded-full bg-widget-uptime" />
              </div>
            </VisualCard>
            <VisualCard
              selected={ticker.chipColors === "accent"}
              onClick={() => setTicker("chipColors", "accent")}
              label="Theme"
            >
              <div className="flex items-center gap-1 w-full">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full bg-primary" />
                ))}
              </div>
            </VisualCard>
            <VisualCard
              selected={ticker.chipColors === "muted"}
              onClick={() => setTicker("chipColors", "muted")}
              label="Subtle"
            >
              <div className="flex items-center gap-1 w-full">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full bg-fg-3/30" />
                ))}
              </div>
            </VisualCard>
          </div>
        </SettingGroup>

        {/* ── Advanced ────────────────────────────────────────── */}
        <div className="border-t border-edge/30 pt-4">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-2 text-[11px] font-mono font-semibold uppercase tracking-wider text-fg-4 hover:text-fg-3 transition-colors w-full"
          >
            <ChevronDown
              size={12}
              className={clsx("transition-transform duration-200", advancedOpen && "rotate-180")}
            />
            Advanced
          </button>

          {advancedOpen && (
            <div className="mt-3 space-y-3 pl-1">
              {/* Scroll mode */}
              <AdvancedRow label="Scroll mode">
                <SegmentedPicker
                  value={ticker.scrollMode}
                  options={SCROLL_MODE_OPTIONS}
                  onChange={(v) => setTicker("scrollMode", v)}
                />
              </AdvancedRow>

              {/* Direction */}
              {ticker.scrollMode !== "flip" && (
                <AdvancedRow label="Direction">
                  <SegmentedPicker
                    value={ticker.tickerDirection}
                    options={DIRECTION_OPTIONS}
                    onChange={(v) => setTicker("tickerDirection", v)}
                  />
                </AdvancedRow>
              )}

              {/* Item order */}
              <AdvancedRow label="Item order">
                <SegmentedPicker
                  value={ticker.mixMode}
                  options={MIX_OPTIONS}
                  onChange={(v) => setTicker("mixMode", v)}
                />
              </AdvancedRow>
            </div>
          )}
        </div>

        {/* ── Reset ───────────────────────────────────────────── */}
        <div className="flex justify-end pt-1">
          <ResetButton label="Reset to defaults" onClick={handleReset} />
        </div>
      </motion.div>
    </div>
  );
}

// ── Preview chip ────────────────────────────────────────────────

function PreviewChip({ chip, comfort, colorMode }: { chip: SampleChip; comfort: boolean; colorMode: ChipColorMode }) {
  const c = colorMode === "muted" ? MUTED_OVERRIDE
    : colorMode === "accent" ? ACCENT_OVERRIDE
    : chip;

  return (
    <motion.span
      layout
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className={clsx(
        "ticker-chip inline-flex px-3 rounded-sm ring-1 ring-inset font-mono whitespace-nowrap",
        c.color, c.borderColor,
        comfort
          ? "flex-col items-start justify-center py-1.5 gap-0"
          : "items-center gap-1.5 py-1.5 text-[13px]",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={clsx("font-semibold text-[11px] uppercase tracking-wider", c.textColor + "/60")}>{chip.label}</span>
        {chip.value && <span className={c.textColor}>{chip.value}</span>}
      </span>
      <AnimatePresence>
        {comfort && chip.detail && (
          <motion.span
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className={clsx("text-[10px] overflow-hidden", c.textColor + "/40")}
          >
            {chip.detail}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.span>
  );
}

// ── Preview row — mirrors the real ScrollrTicker's mode handling ─

function PreviewRow({
  chips,
  comfort,
  colorMode,
  scrollMode,
  speed,
  direction,
  stepPause,
  pauseOnHover,
  hoverSpeed,
  gap,
}: {
  chips: SampleChip[];
  comfort: boolean;
  colorMode: ChipColorMode;
  scrollMode: ScrollMode;
  speed: number;
  direction: TickerDirection;
  stepPause: number;
  pauseOnHover: boolean;
  hoverSpeed: number;
  gap: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chipItems = chips.map((chip, i) => (
    <PreviewChip key={`${chip.label}-${chip.value}-${i}`} chip={chip} comfort={comfort} colorMode={colorMode} />
  ));

  // ── Step mode: Ticker with offset-driven animation (matches real ticker) ──
  const offset = useMotionValue(0);

  useEffect(() => {
    if (scrollMode !== "step" || chips.length === 0) return;
    offset.set(0);

    let cancelled = false;
    const transitionDuration = Math.max(0.15, 1.2 - (speed - 5) * 0.0072);

    async function stepLoop() {
      await sleep(600);
      while (!cancelled) {
        // Measure first chip width for step size
        const container = containerRef.current;
        const firstItem = container?.querySelector(".ticker-chip") as HTMLElement | null;
        const stepSize = firstItem ? firstItem.offsetWidth + gap : 160;

        const sign = direction === "left" ? 1 : -1;
        const current = offset.get();

        await animate(offset, current + sign * stepSize, {
          duration: transitionDuration,
          ease: [0.25, 0.1, 0.25, 1],
        });

        if (cancelled) break;
        await sleep(stepPause * 1000);
      }
    }

    stepLoop();
    return () => { cancelled = true; };
  }, [scrollMode, speed, direction, stepPause, gap, chips.length, offset]);

  // ── Flip mode: AnimatePresence vertical slide (matches real ticker) ──
  const [flipPage, setFlipPage] = useState(0);

  const visibleCount = useMemo(() => {
    const w = containerRef.current?.clientWidth ?? 600;
    const avgChipWidth = comfort ? 180 : 120;
    return Math.max(1, Math.floor(w / (avgChipWidth + gap)));
  }, [comfort, gap, chips.length]);

  useEffect(() => {
    if (scrollMode !== "flip" || chips.length === 0) return;
    setFlipPage(0);
    const timer = setInterval(() => setFlipPage((p) => p + 1), stepPause * 1000);
    return () => clearInterval(timer);
  }, [scrollMode, stepPause, chips.length]);

  const flipShift = chips.length > 0 ? (flipPage * visibleCount) % chips.length : 0;
  const flipChips = [...chips.slice(flipShift), ...chips.slice(0, flipShift)];
  const transitionDuration = Math.max(0.15, 1.2 - (speed - 5) * 0.0072);

  // ── Render based on scroll mode ───────────────────────────────

  if (scrollMode === "flip") {
    return (
      <div ref={containerRef} className="ticker-container w-full py-2 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={flipPage}
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-100%", opacity: 0 }}
            transition={{ duration: transitionDuration, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex items-center h-full px-2"
            style={{ gap }}
          >
            {flipChips.map((chip, i) => (
              <PreviewChip key={`${chip.label}-${chip.value}-${i}`} chip={chip} comfort={comfort} colorMode={colorMode} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // Continuous and step both use the Ticker component (same as real ticker)
  const isStep = scrollMode === "step";
  const velocity = direction === "left" ? speed : -speed;

  return (
    <div ref={containerRef} className="ticker-container w-full py-2 overflow-hidden relative">
      <Ticker
        items={chipItems}
        velocity={isStep ? 0 : velocity}
        offset={isStep ? offset : undefined}
        hoverFactor={isStep ? 1 : (pauseOnHover ? hoverSpeed : 1)}
        gap={gap}
        fade={40}
      />
    </div>
  );
}

/** Promise-based sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Setting group ───────────────────────────────────────────────

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-fg-4 mb-2.5">
        {label}
      </h3>
      {children}
    </div>
  );
}

// ── Visual card selector ────────────────────────────────────────

function VisualCard({
  selected,
  onClick,
  label,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer",
        selected
          ? "border-accent/60 bg-accent/5"
          : "border-edge/40 bg-surface-2/30 hover:border-edge/60 hover:bg-surface-2/50",
      )}
    >
      <div className="w-full px-1">{children}</div>
      <span className={clsx(
        "text-[10px] font-mono uppercase tracking-wider",
        selected ? "text-accent" : "text-fg-4",
      )}>
        {label}
      </span>
    </button>
  );
}

// ── Speed slider ────────────────────────────────────────────────

function SpeedSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = ((value - 5) / (150 - 5)) * 100;

  return (
    <div className="space-y-2">
      <div className="relative h-8 flex items-center">
        {/* Track */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-base-300" />
        {/* Filled */}
        <div
          className="absolute left-0 h-1.5 rounded-full bg-accent/50"
          style={{ width: `${pct}%` }}
        />
        {/* Input */}
        <input
          type="range"
          aria-label="Ticker speed"
          min={5}
          max={150}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
        {/* Thumb */}
        <div
          className="absolute w-4 h-4 rounded-full bg-fg-2 border-2 border-surface shadow-md pointer-events-none"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-fg-4 uppercase tracking-wider px-0.5">
        <span>Slow</span>
        <span>Fast</span>
      </div>
    </div>
  );
}

// ── Advanced row ────────────────────────────────────────────────

function AdvancedRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] font-mono text-fg-3">{label}</span>
      {children}
    </div>
  );
}

// ── Segmented picker (compact, for advanced section) ────────────

function SegmentedPicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg bg-base-200 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer leading-none",
            value === opt.value
              ? "bg-base-300 text-fg shadow-sm"
              : "text-fg-3 hover:text-fg-2",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
