import { useMemo } from "react";
import { clsx } from "clsx";
import { GameItem } from "./GameItem";
import { isLive, isPre, isFinal } from "../../utils/gameHelpers";
import { shouldShowOnFeed } from "../../preferences";
import type { Game, FeedMode } from "../../types";
import type { SportsDisplayPrefs } from "../../hooks/useSportsConfig";
import type { StatusFilter } from "./FeedTab";

interface ScoresTabProps {
  games: Game[];
  mode: FeedMode;
  display: SportsDisplayPrefs;
  favoriteTeams: Set<string>;
  leagueFilter: Set<string>;
  statusFilter: StatusFilter;
}

function isFavoriteGame(game: Game, favorites: Set<string>): boolean {
  return favorites.has(game.home_team_name) || favorites.has(game.away_team_name);
}

export function ScoresTab({
  games,
  mode,
  display,
  favoriteTeams,
  leagueFilter,
  statusFilter,
}: ScoresTabProps) {
  const filtered = useMemo(() => {
    return games.filter((g) => {
      // League filter
      if (leagueFilter.size > 0 && !leagueFilter.has(g.league)) return false;

      // Status filter overrides display prefs when not "all"
      if (statusFilter === "live") return isLive(g);
      if (statusFilter === "upcoming") return isPre(g);
      if (statusFilter === "final") return isFinal(g);

      // "all" — use display prefs
      if (!shouldShowOnFeed(display.showUpcoming) && isPre(g)) return false;
      if (!shouldShowOnFeed(display.showFinal) && isFinal(g)) return false;
      return true;
    });
  }, [games, display.showUpcoming, display.showFinal, leagueFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of filtered) {
      const league = g.league || "Other";
      if (!map.has(league)) map.set(league, []);
      map.get(league)!.push(g);
    }
    // Sort within each league: favorites first, then live games, then rest
    for (const [, leagueGames] of map) {
      leagueGames.sort((a, b) => {
        const aFav = isFavoriteGame(a, favoriteTeams) ? 1 : 0;
        const bFav = isFavoriteGame(b, favoriteTeams) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        const aLive = isLive(a) ? 1 : 0;
        const bLive = isLive(b) ? 1 : 0;
        return bLive - aLive;
      });
    }
    // Sort league groups: those with live games first, then alphabetical
    return Array.from(map.entries()).sort(([aKey, aGames], [bKey, bGames]) => {
      const aHasLive = aGames.some(isLive);
      const bHasLive = bGames.some(isLive);
      if (aHasLive !== bHasLive) return bHasLive ? 1 : -1;
      return aKey.localeCompare(bKey);
    });
  }, [filtered, favoriteTeams]);

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-fg-3 text-xs">
        No games to show
      </div>
    );
  }

  return (
    <div className="bg-edge">
      {grouped.map(([league, leagueGames]) => (
        <div key={league}>
          <div className="px-3 py-1.5 bg-surface-hover border-b border-edge/30">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-3">
              {league}
            </span>
            <span className="text-[10px] text-fg-3 ml-2">
              {leagueGames.length} {leagueGames.length === 1 ? "game" : "games"}
            </span>
          </div>
          <div
            className={clsx(
              "grid gap-px bg-edge",
              mode === "compact"
                ? "grid-cols-1"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {leagueGames.map((game) => (
              <GameItem
                key={String(game.id)}
                game={game}
                mode={mode}
                isFavorite={isFavoriteGame(game, favoriteTeams)}
                showLogos={shouldShowOnFeed(display.showLogos)}
                showTimer={shouldShowOnFeed(display.showTimer)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
