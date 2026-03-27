/**
 * Sports FeedTab — desktop-native.
 *
 * Renders a grid of game scoreboard cards with real-time score
 * updates via the desktop CDC/SSE pipeline. Shows live indicators,
 * team logos, and flash animations on score changes.
 */
import { useMemo, useCallback } from "react";
import { clsx } from "clsx";
import { Trophy } from "lucide-react";
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import { isLive } from "../../utils/gameHelpers";
import { GameItem } from "./GameItem";
import EmptyChannelState from "../../components/EmptyChannelState";
import type { Game, FeedTabProps, ChannelManifest } from "../../types";

// ── Channel manifest ─────────────────────────────────────────────

export const sportsChannel: ChannelManifest = {
  id: "sports",
  name: "Sports",
  tabLabel: "Sports",
  description: "Live scores and game updates",
  hex: "#f97316",
  icon: Trophy,
  info: {
    about:
      "Follow live scores across NFL, NBA, MLB, NHL, MLS, and more. " +
      "Scores update automatically with a visual flash when they change.",
    usage: [
      "Pick your leagues from the Settings tab.",
      "Live games show a pulsing indicator and scores update automatically.",
      "Final scores highlight the winning team in bold.",
    ],
  },
  FeedTab: SportsFeedTab,
};

// ── FeedTab ──────────────────────────────────────────────────────

function SportsFeedTab({ mode, feedContext }: FeedTabProps) {
  const keyOf = useCallback((g: Game) => String(g.id), []);
  const validate = useCallback(
    (record: Record<string, unknown>) => record.id != null,
    [],
  );

  const { items: games } = useScrollrCDC<Game>({
    table: "games",
    dataKey: "sports",
    keyOf,
    validate,
  });

  // Group games by league, live games first within each group
  const grouped = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of games) {
      const league = g.league || "Other";
      if (!map.has(league)) map.set(league, []);
      map.get(league)!.push(g);
    }
    // Sort each league's games: live first, then by start time
    for (const [, leagueGames] of map) {
      leagueGames.sort((a, b) => {
        const aLive = isLive(a) ? 1 : 0;
        const bLive = isLive(b) ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
        return 0;
      });
    }
    // Sort leagues: leagues with live games first, then alphabetical
    return Array.from(map.entries()).sort(([aKey, aGames], [bKey, bGames]) => {
      const aHasLive = aGames.some(isLive);
      const bHasLive = bGames.some(isLive);
      if (aHasLive !== bHasLive) return bHasLive ? 1 : -1;
      return aKey.localeCompare(bKey);
    });
  }, [games]);

  if (games.length === 0) {
    return (
      <EmptyChannelState
        icon={Trophy}
        noun="leagues"
        hasConfig={!!feedContext.__hasConfig}
        dashboardLoaded={!!feedContext.__dashboardLoaded}
        loadingNoun="scores"
        actionHint="pick your leagues"
      />
    );
  }

  return (
    <div className="bg-edge">
      {grouped.map(([league, leagueGames]) => (
        <div key={league}>
          {/* League header */}
          <div className="px-3 py-1.5 bg-surface-hover border-b border-edge">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-3">
              {league}
            </span>
            <span className="text-[10px] text-fg-4 ml-2">
              {leagueGames.length}{" "}
              {leagueGames.length === 1 ? "game" : "games"}
            </span>
          </div>
          {/* Games */}
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
