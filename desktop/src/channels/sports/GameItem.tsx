/**
 * GameItem — renders a single game scoreboard card.
 *
 * Supports compact (single-row) and comfort (two-row with team logos)
 * display modes. Flashes briefly when scores update via CDC.
 */
import { useState, useEffect, useRef } from "react";
import { clsx } from "clsx";
import type { Game, FeedMode } from "../../types";

interface GameItemProps {
  game: Game;
  mode: FeedMode;
}

function formatScore(score: number | string): string {
  return String(score);
}

function statusLabel(game: Game): string {
  if (isLive(game)) {
    if (game.timer) return game.timer;
    if (game.status_long) return game.status_long;
    if (game.short_detail) return game.short_detail;
    return "Live";
  }
  if (game.state === "final" || game.state === "post") {
    if (game.status_long) return game.status_long;
    if (game.short_detail) return game.short_detail;
    return "Final";
  }
  if (game.state === "pre") {
    if (game.status_long) return game.status_long;
    if (game.short_detail) return game.short_detail;
    return "Upcoming";
  }
  if (game.status_long) return game.status_long;
  if (game.short_detail) return game.short_detail;
  if (game.status_short) return game.status_short;
  return "";
}

function isLive(game: Game): boolean {
  return game.state === "in_progress" || game.state === "in";
}

function getWinner(game: Game): "home" | "away" | null {
  if (game.state !== "final") return null;
  const a = Number(game.away_team_score);
  const h = Number(game.home_team_score);
  if (isNaN(a) || isNaN(h) || a === h) return null;
  return h > a ? "home" : "away";
}

// ── Score flash hook ────────────────────────────────────────────

function useScoreFlash(
  awayScore: number | string,
  homeScore: number | string,
): boolean {
  const prevRef = useRef({ away: awayScore, home: homeScore });
  const [flash, setFlash] = useState(false);
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      prevRef.current = { away: awayScore, home: homeScore };
      return;
    }

    const prev = prevRef.current;
    if (prev.away !== awayScore || prev.home !== homeScore) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      prevRef.current = { away: awayScore, home: homeScore };
      return () => clearTimeout(t);
    }
  }, [awayScore, homeScore]);

  return flash;
}

// ── Component ───────────────────────────────────────────────────

export function GameItem({ game, mode }: GameItemProps) {
  const live = isLive(game);
  const isFinal = game.state === "final";
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
        {game.away_team_logo && (
          <img
            src={game.away_team_logo}
            alt=""
            className="w-4 h-4 object-contain"
          />
        )}
        <span
          className={clsx(
            "font-mono font-medium min-w-[28px]",
            isFinal && winner === "home" ? "text-fg-3" : "text-fg",
            winner === "away" && "font-bold",
          )}
        >
          {game.away_team_name.slice(0, 3).toUpperCase()}
        </span>
        <span
          className={clsx(
            "font-mono tabular-nums",
            isFinal && winner === "home" ? "text-fg-3" : "text-fg",
            winner === "away" && "font-bold",
          )}
        >
          {formatScore(game.away_team_score)}
        </span>
        <span className="text-fg-4 font-mono">&ndash;</span>
        <span
          className={clsx(
            "font-mono tabular-nums",
            isFinal && winner === "away" ? "text-fg-3" : "text-fg",
            winner === "home" && "font-bold",
          )}
        >
          {formatScore(game.home_team_score)}
        </span>
        <span
          className={clsx(
            "font-mono font-medium min-w-[28px]",
            isFinal && winner === "away" ? "text-fg-3" : "text-fg",
            winner === "home" && "font-bold",
          )}
        >
          {game.home_team_name.slice(0, 3).toUpperCase()}
        </span>
        {game.home_team_logo && (
          <img
            src={game.home_team_logo}
            alt=""
            className="w-4 h-4 object-contain"
          />
        )}
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
          {statusLabel(game)}
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
          {game.away_team_logo && (
            <img
              src={game.away_team_logo}
              alt=""
              className="w-5 h-5 object-contain"
            />
          )}
          <span
            className={clsx(
              "text-sm",
              isFinal && winner === "home" ? "text-fg-3" : "text-fg",
              winner === "away" && "font-semibold",
            )}
          >
            {game.away_team_name}
          </span>
        </div>
        <span
          className={clsx(
            "text-sm font-mono font-bold tabular-nums",
            isFinal && winner === "home" ? "text-fg-3" : "text-fg",
          )}
        >
          {formatScore(game.away_team_score)}
        </span>
      </div>

      <div className="flex items-center justify-between mt-0.5">
        <div className="flex items-center gap-2">
          {game.home_team_logo && (
            <img
              src={game.home_team_logo}
              alt=""
              className="w-5 h-5 object-contain"
            />
          )}
          <span
            className={clsx(
              "text-sm",
              isFinal && winner === "away" ? "text-fg-3" : "text-fg",
              winner === "home" && "font-semibold",
            )}
          >
            {game.home_team_name}
          </span>
        </div>
        <span
          className={clsx(
            "text-sm font-mono font-bold tabular-nums",
            isFinal && winner === "away" ? "text-fg-3" : "text-fg",
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
          {statusLabel(game)}
        </span>
      </div>
    </div>
  );
}
