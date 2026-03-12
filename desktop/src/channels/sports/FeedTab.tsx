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
import { GameItem } from "./GameItem";
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
      "Pick your leagues from the Setup tab.",
      "Live games show a pulsing indicator and scores update automatically.",
      "Final scores highlight the winning team in bold.",
    ],
  },
  FeedTab: SportsFeedTab,
};

// ── FeedTab ──────────────────────────────────────────────────────

function SportsFeedTab({ mode, channelConfig }: FeedTabProps) {
  const initialItems = useMemo(() => {
    const items = channelConfig.__initialItems as Game[] | undefined;
    return items ?? [];
  }, [channelConfig]);

  const keyOf = useCallback((g: Game) => String(g.id), []);
  const validate = useCallback(
    (record: Record<string, unknown>) => record.id != null,
    [],
  );

  const { items: games } = useScrollrCDC<Game>({
    table: "games",
    initialItems,
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
        const aLive = a.state === "in_progress" || a.state === "in" ? 1 : 0;
        const bLive = b.state === "in_progress" || b.state === "in" ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
        return 0;
      });
    }
    // Sort leagues: leagues with live games first, then alphabetical
    return Array.from(map.entries()).sort(([aKey, aGames], [bKey, bGames]) => {
      const aHasLive = aGames.some(
        (g) => g.state === "in_progress" || g.state === "in",
      );
      const bHasLive = bGames.some(
        (g) => g.state === "in_progress" || g.state === "in",
      );
      if (aHasLive !== bHasLive) return bHasLive ? 1 : -1;
      return aKey.localeCompare(bKey);
    });
  }, [games]);

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 bg-surface">
        <Trophy size={28} className="text-fg-4/40" />
        {!channelConfig.__dashboardLoaded ? (
          <p className="text-xs text-fg-4">Waiting for game data&hellip;</p>
        ) : channelConfig.__hasConfig ? (
          <p className="text-sm font-medium text-fg-3">
            No active games right now
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-fg-3">
              No leagues selected yet
            </p>
            <p className="text-xs text-fg-4">
              Go to the{" "}
              <span className="text-fg-3 font-medium">Setup</span> tab to pick
              your leagues.
            </p>
          </>
        )}
      </div>
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
