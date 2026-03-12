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
      "Games update in real-time via CDC with score flash animations.",
    usage: [
      "Select your leagues from the Setup tab.",
      "Live games show a pulsing indicator and update scores in real-time.",
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

  return (
    <div
      className={clsx(
        "grid gap-px bg-edge",
        mode === "compact"
          ? "grid-cols-1"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {games.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center gap-2 py-12 bg-surface">
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
                Go to the <span className="text-fg-3 font-medium">Setup</span> tab to pick your leagues.
              </p>
            </>
          )}
        </div>
      )}
      {games.map((game) => (
        <GameItem key={String(game.id)} game={game} mode={mode} />
      ))}
    </div>
  );
}
