import { clsx } from "clsx";
import type { Game } from "~/utils/types";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";

interface GameChipProps {
  game: Game;
  comfort?: boolean;
  colorMode?: ChipColorMode;
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

export default function GameChip({ game, comfort, colorMode = "channel", onClick }: GameChipProps) {
  const c = getChipColors(colorMode, "sports");
  const live = isLive(game);
  const status = shortStatus(game);

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group",
        "px-3 rounded-sm border",
        "font-mono whitespace-nowrap",
        "transition-colors cursor-pointer",
        c.bg, c.border, c.hoverBorder,
        comfort ? "flex flex-col items-start py-1.5 gap-0.5" : "flex items-center gap-2 py-1 text-[13px]",
      )}
    >
      {/* Row 1: scores */}
      <div className={clsx("flex items-center gap-2", comfort && "text-[13px]")}>
        <span className={clsx("font-semibold", c.text)}>
          {game.away_team_name.slice(0, 3).toUpperCase()}
        </span>
        <span className={c.textDim}>{String(game.away_team_score)}</span>
        <span className="text-fg-4">-</span>
        <span className={c.textDim}>{String(game.home_team_score)}</span>
        <span className={clsx("font-semibold", c.text)}>
          {game.home_team_name.slice(0, 3).toUpperCase()}
        </span>
        {!comfort && status && (
          <span
            className={clsx(
              "flex items-center gap-1 text-[11px] uppercase tracking-wider",
              live ? "text-live font-semibold" : "text-fg-3"
            )}
          >
            {live && (
              <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
            )}
            {status}
          </span>
        )}
      </div>
      {/* Row 2: league + detail (comfort only) */}
      {comfort && (
        <div className={clsx("flex items-center gap-1.5 text-[10px]", c.textFaint)}>
          {game.league && (
            <span className="uppercase font-semibold">{game.league}</span>
          )}
          {game.short_detail && (
            <>
              <span className="text-fg-4">&middot;</span>
              <span>{game.short_detail}</span>
            </>
          )}
          {!game.short_detail && status && (
            <>
              <span className="text-fg-4">&middot;</span>
              <span className={clsx("flex items-center gap-1", live && "text-live")}>
                {live && (
                  <span className="w-1 h-1 rounded-full bg-live animate-pulse" />
                )}
                {status}
              </span>
            </>
          )}
        </div>
      )}
    </button>
  );
}
