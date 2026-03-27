import { useMemo } from "react";
import { clsx } from "clsx";
import { GameItem } from "./GameItem";
import { isLive, isPre, isFinal } from "../../utils/gameHelpers";
import type { Game, FeedMode } from "../../types";
import type { SportsDisplayPrefs } from "../../hooks/useSportsConfig";

interface ScoresTabProps {
  games: Game[];
  mode: FeedMode;
  display: SportsDisplayPrefs;
}

export function ScoresTab({ games, mode, display }: ScoresTabProps) {
  const filtered = useMemo(() => {
    return games.filter((g) => {
      if (!display.showUpcoming && isPre(g)) return false;
      if (!display.showFinal && isFinal(g)) return false;
      return true;
    });
  }, [games, display.showUpcoming, display.showFinal]);

  const grouped = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of filtered) {
      const league = g.league || "Other";
      if (!map.has(league)) map.set(league, []);
      map.get(league)!.push(g);
    }
    for (const [, leagueGames] of map) {
      leagueGames.sort((a, b) => {
        const aLive = isLive(a) ? 1 : 0;
        const bLive = isLive(b) ? 1 : 0;
        return bLive - aLive;
      });
    }
    return Array.from(map.entries()).sort(([aKey, aGames], [bKey, bGames]) => {
      const aHasLive = aGames.some(isLive);
      const bHasLive = bGames.some(isLive);
      if (aHasLive !== bHasLive) return bHasLive ? 1 : -1;
      return aKey.localeCompare(bKey);
    });
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-fg-4 text-xs">
        No games to show
      </div>
    );
  }

  return (
    <div className="bg-edge">
      {grouped.map(([league, leagueGames]) => (
        <div key={league}>
          <div className="px-3 py-1.5 bg-surface-hover border-b border-edge">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-3">
              {league}
            </span>
            <span className="text-[10px] text-fg-4 ml-2">
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
              <GameItem key={String(game.id)} game={game} mode={mode} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
