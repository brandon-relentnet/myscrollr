import { clsx } from "clsx";
import type { Game } from "~/utils/types";

interface GameChipProps {
  game: Game;
  onClick?: () => void;
}

function isLive(game: Game): boolean {
  return game.state === "in_progress" || game.state === "in";
}

function shortStatus(game: Game): string {
  if (isLive(game)) return "LIVE";
  if (game.state === "final") return "F";
  return "";
}

export default function GameChip({ game, onClick }: GameChipProps) {
  const live = isLive(game);
  const status = shortStatus(game);

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group flex items-center gap-1.5",
        "px-2.5 py-1 rounded border",
        "text-[11px] font-mono whitespace-nowrap",
        "transition-colors cursor-pointer",
        "bg-surface-2/50 border-edge hover:border-edge-2"
      )}
    >
      <span className="font-semibold text-fg">
        {game.away_team_name.slice(0, 3).toUpperCase()}
      </span>
      <span className="text-fg-2">{String(game.away_team_score)}</span>
      <span className="text-fg-4">-</span>
      <span className="text-fg-2">{String(game.home_team_score)}</span>
      <span className="font-semibold text-fg">
        {game.home_team_name.slice(0, 3).toUpperCase()}
      </span>
      {status && (
        <span
          className={clsx(
            "flex items-center gap-1 text-[9px] uppercase tracking-wider",
            live ? "text-live font-semibold" : "text-fg-3"
          )}
        >
          {live && (
            <span className="w-1 h-1 rounded-full bg-live animate-pulse" />
          )}
          {status}
        </span>
      )}
    </button>
  );
}
