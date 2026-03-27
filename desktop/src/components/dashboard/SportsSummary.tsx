/**
 * SportsSummary — dashboard card content for the Sports channel.
 *
 * Featured-game layout: each league shows one primary game in a
 * detailed two-row card (full names, logos, game clock) with
 * remaining games as compact clickable chips below. Clicking a
 * compact chip swaps it into the primary slot.
 *
 * Auto-selects the most exciting live game per league (closest
 * score) or the next upcoming game when nothing is live.
 */
import { useMemo, useCallback } from "react";
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import { isLive, isFinal, isPre, isCloseGame, getWinner, gameStatusLabel, formatCountdown, displayTeamCode } from "../../utils/gameHelpers";
import { useDashboardPin } from "../../hooks/useDashboardPin";
import { useSportsConfig } from "../../hooks/useSportsConfig";
import clsx from "clsx";
import Tooltip from "../Tooltip";
import TeamLogo from "../TeamLogo";
import type { Game, DashboardResponse } from "../../types";
import type { SportsDisplayPrefs } from "../../hooks/useSportsConfig";
import DashboardEmptyState from "./DashboardEmptyState";

type PinnedMap = Record<string, string>;

// Game state helpers imported from utils/gameHelpers.ts



/** Score difference — lower = closer = more exciting. Returns Infinity for games without valid scores. */
function scoreDiff(g: Game): number {
  if (g.away_team_score == null || g.away_team_score === "" ||
      g.home_team_score == null || g.home_team_score === "") {
    return Infinity;
  }
  return Math.abs(Number(g.away_team_score) - Number(g.home_team_score));
}

// ── Auto-select best primary game for a league ──────────────────

function autoSelectPrimary(games: Game[]): Game {
  // 1. Close live games (most exciting)
  const closeLive = games.filter((g) => isLive(g) && isCloseGame(g));
  if (closeLive.length > 0) {
    return closeLive.sort((a, b) => scoreDiff(a) - scoreDiff(b))[0];
  }
  // 2. Any live game (prefer closest score)
  const live = games.filter(isLive);
  if (live.length > 0) {
    return live.sort((a, b) => scoreDiff(a) - scoreDiff(b))[0];
  }
  // 3. Next upcoming by start_time
  const upcoming = games
    .filter(isPre)
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
  if (upcoming.length > 0) return upcoming[0];
  // 4. Most recent final
  const finals = games.filter(isFinal);
  if (finals.length > 0) return finals[0];
  // Fallback
  return games[0];
}

// ── Primary game (detailed two-row card) ────────────────────────

interface PrimaryGameProps {
  game: Game;
  prefs: SportsDisplayPrefs;
}

function PrimaryGame({ game, prefs }: PrimaryGameProps) {
  const live = isLive(game);
  const pre = isPre(game);
  const winner = getWinner(game);
  const status = gameStatusLabel(game);

  return (
    <div
      className={clsx(
        "rounded-lg px-3 py-2 transition-colors",
        live
          ? "bg-live/5 border border-live/15"
          : "bg-surface-3/30 border border-edge/30",
      )}
    >
      {/* Away team */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {prefs.showLogos && (
            <TeamLogo src={game.away_team_logo} alt={game.away_team_name} />
          )}
          <span
            className={clsx(
              "text-[12px] font-mono",
              winner === "home" ? "text-fg-4" : "text-fg",
              winner === "away" && "font-bold",
            )}
          >
            {displayTeamCode(game.away_team_code, game.away_team_name)}
          </span>
        </div>
        {!pre && (
          <span
            className={clsx(
              "text-[14px] font-mono font-bold tabular-nums shrink-0",
              winner === "home" ? "text-fg-4" : "text-fg",
            )}
          >
            {game.away_team_score == null || game.away_team_score === "" ? "-" : game.away_team_score}
          </span>
        )}
      </div>

      {/* Home team */}
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {prefs.showLogos && (
            <TeamLogo src={game.home_team_logo} alt={game.home_team_name} />
          )}
          <span
            className={clsx(
              "text-[12px] font-mono",
              winner === "away" ? "text-fg-4" : "text-fg",
              winner === "home" && "font-bold",
            )}
          >
            {displayTeamCode(game.home_team_code, game.home_team_name)}
          </span>
        </div>
        {!pre && (
          <span
            className={clsx(
              "text-[14px] font-mono font-bold tabular-nums shrink-0",
              winner === "away" ? "text-fg-4" : "text-fg",
            )}
          >
            {game.home_team_score == null || game.home_team_score === "" ? "-" : game.home_team_score}
          </span>
        )}
      </div>

      {/* Status line */}
      {prefs.showTimer && status && (
        <div className="flex items-center gap-1.5 mt-1.5">
          {live && (
            <span className="w-1.5 h-1.5 rounded-full bg-live shrink-0 animate-pulse" />
          )}
          {pre && (
            <span className="text-[9px] text-fg-4 shrink-0">&#9200;</span>
          )}
          <span
            className={clsx(
              "text-[10px] font-mono uppercase",
              live ? "text-live font-semibold" : "text-fg-4",
            )}
          >
            {status}
          </span>
          {live && isCloseGame(game) && (
            <span className="text-[9px] font-mono text-live/70 ml-auto">
              Close
            </span>
          )}
        </div>
      )}

      {/* Minimal live/upcoming indicator when timer is hidden */}
      {!prefs.showTimer && (live || pre) && (
        <div className="flex items-center gap-1 mt-1.5">
          {live && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-live shrink-0 animate-pulse" />
              <span className="text-[10px] font-mono text-live font-semibold uppercase">
                Live
              </span>
            </>
          )}
          {pre && (
            <>
              <span className="text-[9px] text-fg-4">&#9200;</span>
              <span className="text-[10px] font-mono text-fg-4">
                {formatCountdown(game.start_time)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Compact game chip (clickable) ───────────────────────────────

interface CompactChipProps {
  game: Game;
  onPromote: () => void;
  showFinals: boolean;
  showUpcoming: boolean;
}

function CompactChip({ game, onPromote, showFinals, showUpcoming }: CompactChipProps) {
  const live = isLive(game);
  const final = isFinal(game);
  const pre = isPre(game);

  if (final && !showFinals) return null;
  if (pre && !showUpcoming) return null;

  return (
    <Tooltip content="Click to feature this game">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPromote();
        }}
        className={clsx(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono",
          "transition-colors cursor-pointer shrink-0",
          live
            ? "bg-live/8 hover:bg-live/15 text-fg-2"
            : "bg-surface-3/40 hover:bg-surface-3/70 text-fg-3",
        )}
      >
        {live && (
          <span className="w-1 h-1 rounded-full bg-live shrink-0 animate-pulse" />
        )}
        <span className={live ? "font-semibold" : ""}>
          {displayTeamCode(game.away_team_code, game.away_team_name)}
        </span>
        {pre ? (
          <span className="text-fg-4">vs</span>
        ) : (
          <>
            <span className="tabular-nums">
              {game.away_team_score == null || game.away_team_score === "" ? "-" : game.away_team_score}
              -
              {game.home_team_score == null || game.home_team_score === "" ? "-" : game.home_team_score}
            </span>
          </>
        )}
        <span className={live ? "font-semibold" : ""}>
          {displayTeamCode(game.home_team_code, game.home_team_name)}
        </span>
        {final && <span className="text-fg-4 text-[9px]">F</span>}
        {pre && <span className="text-fg-4 text-[9px]">{formatCountdown(game.start_time)}</span>}
      </button>
    </Tooltip>
  );
}

// ── League section ──────────────────────────────────────────────

interface LeagueSectionProps {
  league: string;
  games: Game[];
  prefs: SportsDisplayPrefs;
  pinnedId: string | undefined;
  onPin: (gameId: string) => void;
}

function LeagueSection({ league, games, prefs, pinnedId, onPin }: LeagueSectionProps) {
  // Determine primary game
  const pinned = pinnedId
    ? games.find((g) => String(g.id) === pinnedId)
    : undefined;
  const primary = pinned ?? autoSelectPrimary(games);
  const others = games.filter((g) => g !== primary);

  const liveCount = games.filter(isLive).length;

  return (
    <div>
      {/* League header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-fg-3">
          {league}
        </span>
        {liveCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-live animate-pulse" />
            <span className="text-[9px] font-mono text-live font-semibold">
              {liveCount} live
            </span>
          </div>
        )}
      </div>

      {/* Primary game */}
      <PrimaryGame game={primary} prefs={prefs} />

      {/* Compact overflow */}
      {prefs.compact && others.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {others.map((game) => (
            <CompactChip
              key={String(game.id)}
              game={game}
              onPromote={() => onPin(String(game.id))}
              showFinals={prefs.showFinal}
              showUpcoming={prefs.showUpcoming}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────

interface SportsSummaryProps {
  dashboard: DashboardResponse | undefined;
  onConfigure?: () => void;
}

export default function SportsSummary({ dashboard, onConfigure }: SportsSummaryProps) {
  const { display: prefs } = useSportsConfig();
  const { items } = useScrollrCDC<Game>({
    table: "games",
    dataKey: "sports",
    keyOf: (g) => String(g.id),
    maxItems: 200,
  });

  const [pinned, setPinned] = useDashboardPin<PinnedMap>("dashboard:sports:pinnedGames", {});

  const handlePin = useCallback((league: string, gameId: string) => {
    setPinned({ ...pinned, [league]: gameId });
  }, [pinned, setPinned]);

  // Group and sort — same logic as the full FeedTab
  const grouped = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of items) {
      const league = g.league || "Other";
      if (!map.has(league)) map.set(league, []);
      map.get(league)!.push(g);
    }
    // Within each league: live first, then pre, then final
    for (const [, leagueGames] of map) {
      leagueGames.sort((a, b) => {
        const order = (g: Game) => (isLive(g) ? 0 : isPre(g) ? 1 : 2);
        return order(a) - order(b);
      });
    }
    // Leagues with live games first, then alphabetical
    return Array.from(map.entries()).sort(([aKey, aGames], [bKey, bGames]) => {
      const aLive = aGames.some(isLive);
      const bLive = bGames.some(isLive);
      if (aLive !== bLive) return bLive ? 1 : -1;
      return aKey.localeCompare(bKey);
    });
  }, [items]);

  if (items.length === 0) {
    return (
      <DashboardEmptyState
        message="No games right now"
        actionLabel={onConfigure ? "Add leagues \u2192" : undefined}
        onAction={onConfigure}
      />
    );
  }

  const liveTotal = items.filter(isLive).length;
  const leagues = new Set(items.map((g) => g.league));

  // Clean stale pins (games no longer in data)
  const gameIds = new Set(items.map((g) => String(g.id)));
  const cleanPinned = Object.fromEntries(
    Object.entries(pinned).filter(([, id]) => gameIds.has(id)),
  );

  return (
    <div className="space-y-3">
      {/* League sections */}
      {grouped.map(([league, games]) => (
        <LeagueSection
          key={league}
          league={league}
          games={games}
          prefs={prefs}
          pinnedId={cleanPinned[league]}
          onPin={(gameId) => handlePin(league, gameId)}
        />
      ))}

      {/* Stats footer */}
      {prefs.stats && (
        <div className="flex items-center gap-3 pt-1 border-t border-edge/30">
          <span className="text-[10px] text-fg-4">
            {items.length} games
          </span>
          {liveTotal > 0 && (
            <span className="text-[10px] text-live font-semibold">
              {liveTotal} live
            </span>
          )}
          <span className="text-[10px] text-fg-4">
            {leagues.size} league{leagues.size !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
