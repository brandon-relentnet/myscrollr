import { clsx } from "clsx";
import { motion } from "motion/react";
import type { ChipColorMode, FantasyDisplayPrefs } from "../../preferences";
import { shouldShowOnTicker } from "../../preferences";
import type { LeagueResponse } from "../../channels/fantasy/types";
import {
  SPORT_EMOJI,
  countInjuries,
  estimateWinProbability,
  fmtPlayerPoints,
  isBenchPosition,
  isMatchupFinal,
  isMatchupLive,
  streakLabel,
  teamScore,
  userMatchupContext,
  userRoster,
  userStanding,
} from "../../channels/fantasy/types";
import { getChipColors, chipBaseClasses } from "./chipColors";

interface FantasyStatChipProps {
  league: LeagueResponse;
  prefs: FantasyDisplayPrefs;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

interface StatSegment {
  key: string;
  text: string;
  tone?: "neutral" | "up" | "down" | "live";
}

/**
 * Compact fantasy ticker chip that renders the ENABLED subset of the
 * 10 per-league items gated by the user's per-item `Venue` prefs.
 *
 * This chip replaces the older `FantasyChip` for ticker use. It keeps
 * the same visual footprint (single row when `comfort=false`, two rows
 * when true) but composes the contents from whichever items the user
 * has routed to the ticker via the Display page's `VenueRow` controls.
 *
 * Each segment is opt-in:
 *   - `matchupScore` — "My Team 89.5 — 76.2 Opp"
 *   - `matchupStatus` — LIVE / FINAL / PRE badge
 *   - `week` — "Wk 5"
 *   - `projectedPoints` — "Proj 95.2"
 *   - `winProbability` — "62%"
 *   - `record` — "6-3"
 *   - `standingsPosition` — "3rd / 10"
 *   - `streak` — "W3"
 *   - `injuryCount` — "2 IR"
 *   - `topScorer` — "LeBron 42.3"
 *
 * Segments render only when their data is available for this league
 * (e.g. `standingsPosition` skips pre-season; `topScorer` skips rosters
 * with all-zero points). A league with ZERO ticker-enabled items
 * collapses to a name-only chip so the user still sees something
 * meaningful per-league.
 */
export default function FantasyStatChip({
  league,
  prefs,
  comfort,
  colorMode = "channel",
  onClick,
}: FantasyStatChipProps) {
  const c = getChipColors(colorMode, "fantasy");
  const ctx = userMatchupContext(league);
  const standing = userStanding(league);
  const roster = userRoster(league);

  const segments: StatSegment[] = [];
  let live = false;
  let final = false;
  let scoreTone: "neutral" | "up" | "down" = "neutral";

  // ── Matchup-derived segments ─────────────────────────────────
  if (ctx) {
    live = isMatchupLive(ctx.matchup);
    final = isMatchupFinal(ctx.matchup);
    const myPts = teamScore(ctx.user);
    const oppPts = teamScore(ctx.opponent);
    if (myPts > oppPts) scoreTone = "up";
    else if (myPts < oppPts) scoreTone = "down";

    if (shouldShowOnTicker(prefs.week)) {
      segments.push({ key: "week", text: `Wk ${ctx.matchup.week}` });
    }

    if (shouldShowOnTicker(prefs.matchupStatus)) {
      if (live) segments.push({ key: "status", text: "LIVE", tone: "live" });
      else if (final) segments.push({ key: "status", text: "FINAL" });
      else if (ctx.matchup.status === "preevent") segments.push({ key: "status", text: "PRE" });
    }

    if (shouldShowOnTicker(prefs.matchupScore)) {
      const scoreText = `${fmtPlayerPoints(myPts)}–${fmtPlayerPoints(oppPts)}`;
      segments.push({ key: "score", text: scoreText, tone: scoreTone });
    }

    if (shouldShowOnTicker(prefs.projectedPoints) && typeof ctx.user.projected_points === "number") {
      segments.push({ key: "proj", text: `Proj ${ctx.user.projected_points.toFixed(1)}` });
    }

    if (shouldShowOnTicker(prefs.winProbability)) {
      const wp = estimateWinProbability(ctx.matchup, league.team_key);
      if (wp !== null) {
        segments.push({
          key: "wp",
          text: `${Math.round(wp * 100)}%`,
          tone: wp >= 0.5 ? "up" : "down",
        });
      }
    }
  }

  // ── Standings-derived segments ──────────────────────────────
  if (standing) {
    if (shouldShowOnTicker(prefs.record)) {
      const { wins, losses, ties } = standing;
      const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
      segments.push({ key: "record", text: record });
    }

    if (shouldShowOnTicker(prefs.standingsPosition) && typeof standing.rank === "number") {
      segments.push({
        key: "rank",
        text: `${ordinal(standing.rank)}/${league.data.num_teams ?? "?"}`,
      });
    }

    if (shouldShowOnTicker(prefs.streak) && standing.streak_value > 0) {
      segments.push({
        key: "streak",
        text: streakLabel(standing.streak_type, standing.streak_value),
        tone: standing.streak_type.toLowerCase().startsWith("w") ? "up" : "down",
      });
    }
  }

  // ── Roster-derived segments ─────────────────────────────────
  if (roster) {
    if (shouldShowOnTicker(prefs.injuryCount)) {
      const injuries = countInjuries(roster);
      if (injuries > 0) {
        segments.push({ key: "inj", text: `${injuries} IR`, tone: "down" });
      }
    }

    if (shouldShowOnTicker(prefs.topScorer)) {
      const top = findTopScorer(roster.data.players);
      if (top) {
        segments.push({
          key: "top",
          text: `${top.name.last} ${top.player_points!.toFixed(1)}`,
        });
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <button
      type="button"
      onClick={onClick}
      className={chipBaseClasses(comfort, c, "font-mono whitespace-nowrap")}
    >
      <div className={clsx("flex items-center gap-2", comfort && "text-[13px]")}>
        <span aria-hidden>{SPORT_EMOJI[league.game_code] ?? "🏆"}</span>
        {live && (
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-live"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <span className={clsx("font-medium truncate max-w-[180px]", c.text)}>
          {league.name}
        </span>
        {segments.map((seg) => (
          <span
            key={seg.key}
            className={clsx(
              "tabular-nums font-medium",
              seg.tone === "up" && "text-up",
              seg.tone === "down" && "text-down",
              seg.tone === "live" && "text-live uppercase tracking-wider text-[10px]",
              !seg.tone && c.textDim,
            )}
          >
            {seg.text}
          </span>
        ))}
      </div>
      {comfort && ctx && (
        <div className={clsx("flex items-center gap-1.5 text-[10px]", c.textFaint)}>
          <span className="uppercase tracking-wider">
            {final ? "Final" : live ? "Live" : `Wk ${ctx.matchup.week}`}
          </span>
          <span>·</span>
          <span className="truncate max-w-[220px]">{ctx.opponent.name}</span>
        </div>
      )}
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────

type Player = ReturnType<typeof userRoster> extends infer R
  ? R extends null | undefined
    ? never
    : R extends { data: { players: infer P } }
      ? P extends (infer Elt)[]
        ? Elt
        : never
      : never
  : never;

/** Highest-`player_points` active-roster player with a non-null score. */
function findTopScorer(players: Player[]): Player | null {
  let best: Player | null = null;
  let bestPoints = -Infinity;
  for (const p of players) {
    if (isBenchPosition(p.selected_position)) continue;
    if (p.player_points === null || p.player_points === undefined) continue;
    if (p.player_points > bestPoints) {
      best = p;
      bestPoints = p.player_points;
    }
  }
  return best;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
