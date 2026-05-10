/**
 * Sports display preferences — the "/channel/sports/display" page.
 *
 * Mirrors the Finance DisplayPanel shape (2026-05-09 IA refactor):
 *   1. Live preview        — a sample game card on the Feed and a
 *                            chip on the Ticker, side by side. Both
 *                            update in real time as the toggles below
 *                            change.
 *   2. Display items grid  — shared `DisplayItemsGrid` widget with
 *                            column-headers-as-bulk-toggles. Two
 *                            sub-groups: "Card chrome" (logos / clock)
 *                            and "Game filters" (upcoming / final).
 *   3. Footer reset        — restore defaults.
 *
 * Why one preview card and not one-per-state:
 *   The two filter toggles (showUpcoming / showFinal) gate which
 *   *games* appear, not how an individual card looks. Showing three
 *   stub cards (pre / live / final) would imply the filters control
 *   layout. A single live sample with the filter rows labelled
 *   clearly in the grid keeps the visual contract honest: the
 *   preview is for chrome (logos + clock); filters are described in
 *   their row text.
 *
 * Sample-game selection:
 *   1. Prefer a live game from the user's dashboard data
 *   2. Fall back to any game from the dashboard
 *   3. Fall back to a hardcoded in-progress sample so the preview
 *      always has something concrete to render
 *
 * Persisted shape unchanged: `Venue` enum (off|feed|ticker|both)
 * converted at the UI boundary via enumToBools / boolsToEnum inside
 * the shared `DisplayItemsGrid`.
 */
import { useMemo } from "react";
import { Eye, Tv } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions } from "../../api/queries";
import { useSportsConfig } from "../../hooks/useSportsConfig";
import type { SportsDisplayPrefs } from "../../hooks/useSportsConfig";
import type { Game } from "../../types";
import { enumToBools, type Venue } from "../../preferences";
import DisplayItemsGrid from "../../components/settings/DisplayItemsGrid";
import type { DisplayItemsSection } from "../../components/settings/DisplayItemsGrid";
import { Section, ResetButton } from "../../components/settings/SettingsControls";
import { isLive } from "../../utils/gameHelpers";
import { GameItem } from "./GameItem";
import GameChip from "../../components/chips/GameChip";

// ── Constants ────────────────────────────────────────────────────

const DEFAULTS: SportsDisplayPrefs = {
  showUpcoming: "both",
  showFinal: "both",
  showLogos: "both",
  showTimer: "both",
};

// Hardcoded in-progress sample. Used when the user has no tracked
// leagues yet (or the dashboard hasn't loaded). Mirrors the shape of
// a real Game — a generic NBA-like matchup, mid-game.
function buildSampleGame(): Game {
  return {
    id: "preview-sample",
    league: "NBA",
    sport: "basketball",
    external_game_id: "preview-sample",
    link: "",
    home_team_name: "Los Angeles Lakers",
    home_team_logo: "",
    home_team_score: 88,
    home_team_code: "LAL",
    away_team_name: "Boston Celtics",
    away_team_logo: "",
    away_team_score: 91,
    away_team_code: "BOS",
    start_time: new Date(Date.now() - 90 * 60_000).toISOString(),
    state: "in_progress",
    status_short: "Q3 4:32",
    status_long: "3rd Quarter 4:32",
    timer: "Q3 4:32",
  };
}

// ── Component ────────────────────────────────────────────────────

export default function SportsDisplayPanel() {
  const { display, setDisplay } = useSportsConfig();

  // Pull a real game from the dashboard so the preview shows
  // something the user recognises. Prefers live games (most visually
  // interesting); falls back to any game; then to a hardcoded sample.
  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const previewGame: Game = useMemo(() => {
    const games = (dashboard?.data?.sports as Game[] | undefined) ?? [];
    if (games.length === 0) return buildSampleGame();
    return games.find(isLive) ?? games[0];
  }, [dashboard?.data?.sports]);

  // ── Patch helpers ──────────────────────────────────────────────

  function applyDisplayChanges(changes: Record<string, Venue>) {
    setDisplay(changes as Partial<SportsDisplayPrefs>);
  }

  function handleReset() {
    setDisplay(DEFAULTS);
  }

  // ── Booleans the preview reads from ───────────────────────────

  const feedShowLogos = enumToBools(display.showLogos).feed;
  const feedShowTimer = enumToBools(display.showTimer).feed;
  const tickerShowLogos = enumToBools(display.showLogos).ticker;
  const tickerShowTimer = enumToBools(display.showTimer).ticker;

  // ── Display-items grid model ──────────────────────────────────

  const sections: DisplayItemsSection[] = [
    {
      title: "Card chrome",
      rows: [
        {
          key: "showLogos",
          label: "Team logos",
          description: "Show team logos on cards and ticker chips",
          value: display.showLogos,
        },
        {
          key: "showTimer",
          label: "Game clock / status",
          description: "Quarter, period, or final-time indicator",
          value: display.showTimer,
        },
      ],
    },
    {
      title: "Game filters",
      rows: [
        {
          key: "showUpcoming",
          label: "Upcoming games",
          description: "Pre-event games (scheduled but not yet started)",
          value: display.showUpcoming,
        },
        {
          key: "showFinal",
          label: "Final scores",
          description: "Completed games",
          value: display.showFinal,
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
            Toggle items below to see the Feed card and Ticker chip update
            in real time. Game filters control which games appear in the
            full Feed.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <PreviewSurface label="Feed" icon={Eye}>
              <SportsFeedPreview
                game={previewGame}
                showLogos={feedShowLogos}
                showTimer={feedShowTimer}
              />
            </PreviewSurface>
            <PreviewSurface label="Ticker" icon={Tv}>
              <SportsTickerPreview
                game={previewGame}
                showLogos={tickerShowLogos}
                showTimer={tickerShowTimer}
              />
            </PreviewSurface>
          </div>
        </div>
      </Section>

      {/* ── Display items grid ───────────────────────────────────── */}
      <DisplayItemsGrid sections={sections} onChange={applyDisplayChanges} />

      {/* ── Footer reset ─────────────────────────────────────────── */}
      <div className="flex items-center justify-end pt-2">
        <ResetButton label="Reset display settings" onClick={handleReset} />
      </div>
    </div>
  );
}

// ── Preview surface card ────────────────────────────────────────
// Same chrome as the Finance DisplayPanel — kept inline rather than
// extracted because each channel's preview has channel-specific
// padding / min-height nuances and a shared component would just
// take a className prop, which is barely an abstraction.

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

// ── Feed preview — a real GameItem in compact mode ──────────────
// Reusing the actual production component means the preview is
// exactly what the user will see in the Feed. Any future GameItem
// changes propagate here for free.

interface SportsFeedPreviewProps {
  game: Game;
  showLogos: boolean;
  showTimer: boolean;
}

function SportsFeedPreview({
  game,
  showLogos,
  showTimer,
}: SportsFeedPreviewProps) {
  return (
    <div className="w-full">
      <GameItem
        game={game}
        mode="compact"
        showLogos={showLogos}
        showTimer={showTimer}
      />
    </div>
  );
}

// ── Ticker preview — a real GameChip ────────────────────────────

interface SportsTickerPreviewProps {
  game: Game;
  showLogos: boolean;
  showTimer: boolean;
}

function SportsTickerPreview({
  game,
  showLogos,
  showTimer,
}: SportsTickerPreviewProps) {
  return (
    <GameChip
      game={game}
      comfort={false}
      colorMode="channel"
      showLogos={showLogos}
      showTimer={showTimer}
    />
  );
}
