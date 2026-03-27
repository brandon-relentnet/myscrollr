/**
 * GameItem — renders a single game scoreboard card.
 *
 * Supports compact (single-row) and comfort (two-row with team logos)
 * display modes. Flashes briefly when scores update via CDC.
 */
import { memo, useState } from "react";
import { clsx } from "clsx";
import { isLive, isFinal, getWinner, gameStatusLabel, abbreviateTeam } from "../../utils/gameHelpers";
import { useScoreFlash } from "../../hooks/useScoreFlash";
import type { Game, FeedMode } from "../../types";

interface GameItemProps {
  game: Game;
  mode: FeedMode;
}

function formatScore(score: number | string | null | undefined): string {
  if (score == null || score === "") return "-";
  return String(score);
}

function TeamLogo({ src, alt, size = "w-4 h-4" }: { src: string; alt: string; size?: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={`${size} object-contain`}
      onError={() => setErr(true)}
    />
  );
}

// ── Component ───────────────────────────────────────────────────

export const GameItem = memo(function GameItem({ game, mode }: GameItemProps) {
  const live = isLive(game);
  const final_ = isFinal(game);
  const winner = getWinner(game);
  const flash = useScoreFlash(game.away_team_score, game.home_team_score);

  if (mode === "compact") {
    return (
      <div
        className={clsx(
          "flex items-center gap-2 px-3 py-1.5 bg-surface text-xs transition-colors duration-700",
          flash && "bg-live/10",
        )}
      >
        <TeamLogo src={game.away_team_logo} alt={game.away_team_name} />
        <span
          className={clsx(
            "font-mono font-medium min-w-[28px]",
            final_ && winner === "home" ? "text-fg-3" : "text-fg",
            winner === "away" && "font-bold",
          )}
        >
          {abbreviateTeam(game.away_team_name)}
        </span>
        <span
          className={clsx(
            "font-mono tabular-nums",
            final_ && winner === "home" ? "text-fg-3" : "text-fg",
            winner === "away" && "font-bold",
          )}
        >
          {formatScore(game.away_team_score)}
        </span>
        <span className="text-fg-4 font-mono">&ndash;</span>
        <span
          className={clsx(
            "font-mono tabular-nums",
            final_ && winner === "away" ? "text-fg-3" : "text-fg",
            winner === "home" && "font-bold",
          )}
        >
          {formatScore(game.home_team_score)}
        </span>
        <span
          className={clsx(
            "font-mono font-medium min-w-[28px]",
            final_ && winner === "away" ? "text-fg-3" : "text-fg",
            winner === "home" && "font-bold",
          )}
        >
          {abbreviateTeam(game.home_team_name)}
        </span>
        <TeamLogo src={game.home_team_logo} alt={game.home_team_name} />
        <span
          className={clsx(
            "ml-auto text-[9px] font-mono uppercase tracking-wider",
            live && "text-live font-bold",
            !live && "text-fg-3",
          )}
        >
          {live && (
            <span className="inline-block w-1 h-1 rounded-full bg-live mr-1 align-middle animate-pulse" />
          )}
          {gameStatusLabel(game)}
        </span>
      </div>
    );
  }

  // Comfort mode
  return (
    <div
      className={clsx(
        "px-3 py-2 bg-surface border-l-2 transition-colors duration-700",
        live ? "border-l-live/40" : "border-l-transparent",
        flash && "bg-live/8",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TeamLogo src={game.away_team_logo} alt={game.away_team_name} size="w-5 h-5" />
          <span
            className={clsx(
              "text-sm",
              final_ && winner === "home" ? "text-fg-3" : "text-fg",
              winner === "away" && "font-semibold",
            )}
          >
            {game.away_team_name}
          </span>
        </div>
        <span
          className={clsx(
            "text-sm font-mono font-bold tabular-nums",
            final_ && winner === "home" ? "text-fg-3" : "text-fg",
          )}
        >
          {formatScore(game.away_team_score)}
        </span>
      </div>

      <div className="flex items-center justify-between mt-0.5">
        <div className="flex items-center gap-2">
          <TeamLogo src={game.home_team_logo} alt={game.home_team_name} size="w-5 h-5" />
          <span
            className={clsx(
              "text-sm",
              final_ && winner === "away" ? "text-fg-3" : "text-fg",
              winner === "home" && "font-semibold",
            )}
          >
            {game.home_team_name}
          </span>
        </div>
        <span
          className={clsx(
            "text-sm font-mono font-bold tabular-nums",
            final_ && winner === "away" ? "text-fg-3" : "text-fg",
          )}
        >
          {formatScore(game.home_team_score)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        {live && (
          <span className="inline-block w-1 h-1 rounded-full bg-live animate-pulse" />
        )}
        <span
          className={clsx(
            "text-[9px] font-mono uppercase tracking-wider",
            live && "text-live font-bold",
            !live && "text-fg-3",
          )}
        >
          {gameStatusLabel(game)}
        </span>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.mode === next.mode &&
  prev.game.id === next.game.id &&
  prev.game.away_team_name === next.game.away_team_name &&
  prev.game.away_team_logo === next.game.away_team_logo &&
  prev.game.away_team_score === next.game.away_team_score &&
  prev.game.home_team_name === next.game.home_team_name &&
  prev.game.home_team_logo === next.game.home_team_logo &&
  prev.game.home_team_score === next.game.home_team_score &&
  prev.game.state === next.game.state &&
  prev.game.timer === next.game.timer &&
  prev.game.status_long === next.game.status_long &&
  prev.game.status_short === next.game.status_short &&
  prev.game.short_detail === next.game.short_detail
);
