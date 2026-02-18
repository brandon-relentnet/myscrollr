import { useMemo, useCallback } from "react";
import { clsx } from "clsx";
import type { Game } from "~/utils/types";
import type { FeedTabProps, ChannelManifest } from "~/channels/types";
import { useScrollrCDC } from "~/channels/hooks/useScrollrCDC";
import GameItem from "./GameItem";

/** Extract initial games from the dashboard response stored in channelConfig. */
function getInitialGames(config: Record<string, unknown>): Game[] {
  const items = config.__initialItems as Game[] | undefined;
  return items ?? [];
}

export const sportsChannel: ChannelManifest = {
  id: "sports",
  name: "Sports",
  tabLabel: "Sports",
  tier: "official",
  FeedTab: SportsFeedTab,
};

export default function SportsFeedTab({ mode, channelConfig }: FeedTabProps) {
  const initialItems = useMemo(
    () => getInitialGames(channelConfig),
    [channelConfig],
  );

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
          Waiting for game data&hellip;
        </div>
      )}
      {games.map((game) => (
        <GameItem key={String(game.id)} game={game} mode={mode} />
      ))}
    </div>
  );
}
