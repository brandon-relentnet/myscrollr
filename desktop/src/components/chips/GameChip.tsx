import { memo } from "react";
import { clsx } from "clsx";
import { isLive, isFinal, isPre, isCloseGame, getWinner, gameStatusLabel, abbreviateTeam } from "../../utils/gameHelpers";
import { useScoreFlash } from "../../hooks/useScoreFlash";
import { getChipColors } from "./chipColors";
import type { Game } from "../../types";
import type { ChipColorMode } from "../../preferences";

// ── Props ───────────────────────────────────────────────────────

interface GameChipProps {
  game: Game;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

// ── Component ───────────────────────────────────────────────────

const GameChip = memo(function GameChip({
  game,
  comfort,
  colorMode = "channel",
  onClick,
}: GameChipProps) {
  const c = getChipColors(colorMode, "sports");
  const live = isLive(game);
  const close = isCloseGame(game);
  const winner = getWinner(game);
  const status = gameStatusLabel(game);
  const final_ = isFinal(game);
  const pre_ = isPre(game);
  const flash = useScoreFlash(game.away_team_score, game.home_team_score);

  // ── Render ──────────────────────────────────────────────────

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group",
        "px-3 rounded-sm border",
        "font-mono whitespace-nowrap",
        "transition-colors duration-700 cursor-pointer",
        flash ? "bg-live/15" : c.bg,
        close ? "border-live/40" : c.border,
        !close && c.hoverBorder,
        comfort
          ? "flex flex-col items-start py-1.5 gap-0.5"
          : "flex items-center gap-2 py-1 text-[13px]",
      )}
    >
      {/* Row 1: logos + scores */}
      <div
        className={clsx("flex items-center gap-1.5", comfort && "text-[13px]")}
      >
        {/* Away team */}
        {game.away_team_logo && (
          <img
            src={game.away_team_logo}
            alt={game.away_team_name}
            className={clsx(
              "object-contain shrink-0",
              comfort ? "w-3.5 h-3.5" : "w-3 h-3",
            )}
          />
        )}
        <span
          className={clsx(
            c.text,
            winner === "away" ? "font-bold" : "font-semibold",
            final_ && winner === "home" && "opacity-50",
          )}
        >
          {abbreviateTeam(game.away_team_name)}
        </span>
        <span
          className={clsx(
            "tabular-nums",
            winner === "away" ? "font-bold " + c.text : c.textDim,
            final_ && winner === "home" && "opacity-50",
            pre_ && "opacity-30",
          )}
        >
          {pre_ ? "_" : String(game.away_team_score)}
        </span>

        <span className="text-fg-4">-</span>

        {/* Home team */}
        <span
          className={clsx(
            "tabular-nums",
            winner === "home" ? "font-bold " + c.text : c.textDim,
            final_ && winner === "away" && "opacity-50",
            pre_ && "opacity-30",
          )}
        >
          {pre_ ? "_" : String(game.home_team_score)}
        </span>
        <span
          className={clsx(
            c.text,
            winner === "home" ? "font-bold" : "font-semibold",
            final_ && winner === "away" && "opacity-50",
          )}
        >
          {abbreviateTeam(game.home_team_name)}
        </span>
        {game.home_team_logo && (
          <img
            src={game.home_team_logo}
            alt={game.home_team_name}
            className={clsx(
              "object-contain shrink-0",
              comfort ? "w-3.5 h-3.5" : "w-3 h-3",
            )}
          />
        )}

        {/* Status (compact only) */}
        {!comfort && status && (
          <span
            className={clsx(
              "flex items-center gap-1 text-[11px] uppercase tracking-wider ml-0.5",
              live ? "text-live font-semibold" : "text-fg-3",
            )}
          >
            {live && (
              <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse shrink-0" />
            )}
            {status}
          </span>
        )}
      </div>

      {/* Row 2: league + timer/status (comfort only) */}
      {comfort && (
        <div
          className={clsx(
            "flex items-center gap-1.5 text-[10px]",
            c.textFaint,
          )}
        >
          {game.league && (
            <span className="uppercase font-semibold">{game.league}</span>
          )}
          {status && (
            <>
              <span className="text-fg-4">&middot;</span>
              <span
                className={clsx(
                  "flex items-center gap-1",
                  live && "text-live font-semibold",
                )}
              >
                {live && (
                  <span className="w-1 h-1 rounded-full bg-live animate-pulse shrink-0" />
                )}
                {status}
              </span>
            </>
          )}
          {close && (
            <>
              <span className="text-fg-4">&middot;</span>
              <span className="text-live/70 font-semibold">Close</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}, (prev, next) =>
  prev.comfort === next.comfort &&
  prev.colorMode === next.colorMode &&
  prev.onClick === next.onClick &&
  prev.game.id === next.game.id &&
  prev.game.sport === next.game.sport &&
  prev.game.league === next.game.league &&
  prev.game.away_team_name === next.game.away_team_name &&
  prev.game.away_team_logo === next.game.away_team_logo &&
  prev.game.away_team_score === next.game.away_team_score &&
  prev.game.home_team_name === next.game.home_team_name &&
  prev.game.home_team_logo === next.game.home_team_logo &&
  prev.game.home_team_score === next.game.home_team_score &&
  prev.game.state === next.game.state &&
  prev.game.timer === next.game.timer &&
  prev.game.status_short === next.game.status_short &&
  prev.game.status_long === next.game.status_long &&
  prev.game.start_time === next.game.start_time
);

export default GameChip;
