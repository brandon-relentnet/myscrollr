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
      "Select your leagues from the Configuration tab.",
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
        <div className="col-span-full text-center py-8 text-fg-3 text-xs font-mono">
          {!channelConfig.__dashboardLoaded
            ? "Waiting for game data\u2026"
            : channelConfig.__hasConfig
              ? "No active games for your selected leagues"
              : "No leagues selected \u2014 configure in Settings"}
        </div>
      )}
      {games.map((game) => (
        <GameItem key={String(game.id)} game={game} mode={mode} />
      ))}
    </div>
  );
}
