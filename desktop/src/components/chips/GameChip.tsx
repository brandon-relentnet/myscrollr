import { useState, useEffect, useRef } from "react";
import { clsx } from "clsx";
import type { Game } from "../../types";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";

// ── Props ───────────────────────────────────────────────────────

interface GameChipProps {
  game: Game;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

// ── Sport utilities (exported for ScrollrTicker sorting) ────────

/** Close-game threshold per sport — roughly "one score" in each sport. */
const CLOSE_THRESHOLDS: Record<string, number> = {
  "american-football": 8,
  "basketball": 6,
  "hockey": 1,
  "baseball": 2,
  "football": 1,
};

export function isLive(game: Game): boolean {
  return game.state === "in_progress" || game.state === "in";
}

export function isCloseGame(game: Game): boolean {
  if (!isLive(game)) return false;
  const away = Number(game.away_team_score);
  const home = Number(game.home_team_score);
  if (isNaN(away) || isNaN(home)) return false;
  return Math.abs(away - home) <= (CLOSE_THRESHOLDS[game.sport] ?? 3);
}

function getWinner(game: Game): "home" | "away" | null {
  if (game.state !== "final") return null;
  const a = Number(game.away_team_score);
  const h = Number(game.home_team_score);
  if (isNaN(a) || isNaN(h) || a === h) return null;
  return h > a ? "home" : "away";
}

function formatCountdown(startTime: string): string {
  const diff = new Date(startTime).getTime() - Date.now();
  if (diff <= 0) return "Starting";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 48) {
    return new Date(startTime).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  if (h >= 24) return "Tomorrow";
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m`;
  return "Soon";
}

/** Rich status for the chip — game clock for live, countdown for pre. */
function chipStatus(game: Game): string {
  if (isLive(game)) return game.timer || game.status_short || "LIVE";
  if (game.state === "final") return game.status_long || "Final";
  if (game.state === "pre") return formatCountdown(game.start_time);
  if (game.state === "postponed") return "PPD";
  return "";
}

// ── Component ───────────────────────────────────────────────────

export default function GameChip({
  game,
  comfort,
  colorMode = "channel",
  onClick,
}: GameChipProps) {
  const c = getChipColors(colorMode, "sports");
  const live = isLive(game);
  const close = isCloseGame(game);
  const winner = getWinner(game);
  const status = chipStatus(game);
  const isFinal = game.state === "final";
  const isPre = game.state === "pre";

  // ── Score change flash ──────────────────────────────────────
  const prevRef = useRef({
    away: game.away_team_score,
    home: game.home_team_score,
  });
  const [flash, setFlash] = useState(false);
  const initialRender = useRef(true);

  useEffect(() => {
    // Skip flash on initial mount — only flash on updates.
    if (initialRender.current) {
      initialRender.current = false;
      prevRef.current = {
        away: game.away_team_score,
        home: game.home_team_score,
      };
      return;
    }

    const prev = prevRef.current;
    if (
      prev.away !== game.away_team_score ||
      prev.home !== game.home_team_score
    ) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      prevRef.current = {
        away: game.away_team_score,
        home: game.home_team_score,
      };
      return () => clearTimeout(t);
    }
  }, [game.away_team_score, game.home_team_score]);

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
            isFinal && winner === "home" && "opacity-50",
          )}
        >
          {game.away_team_name.slice(0, 3).toUpperCase()}
        </span>
        <span
          className={clsx(
            "tabular-nums",
            winner === "away" ? "font-bold " + c.text : c.textDim,
            isFinal && winner === "home" && "opacity-50",
            isPre && "opacity-30",
          )}
        >
          {isPre ? "_" : String(game.away_team_score)}
        </span>

        <span className="text-fg-4">-</span>

        {/* Home team */}
        <span
          className={clsx(
            "tabular-nums",
            winner === "home" ? "font-bold " + c.text : c.textDim,
            isFinal && winner === "away" && "opacity-50",
            isPre && "opacity-30",
          )}
        >
          {isPre ? "_" : String(game.home_team_score)}
        </span>
        <span
          className={clsx(
            c.text,
            winner === "home" ? "font-bold" : "font-semibold",
            isFinal && winner === "away" && "opacity-50",
          )}
        >
          {game.home_team_name.slice(0, 3).toUpperCase()}
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
}
