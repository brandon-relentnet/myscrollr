/**
 * Picker for the "Followed players" list — surfaces every player on
 * every roster across all imported Fantasy leagues, lets the user
 * check which ones to track on the ticker.
 *
 * Each followed player gets its own dedicated `FollowedPlayerChip`
 * in the ticker render path. Use case: a user wants to glance at
 * "Mahomes, CMC, Hill" stats without scanning league-summary chips.
 *
 * Each row shows: position badge, full name, real-team / display
 * position, OWNER context (which fantasy team they're rostered on,
 * in which league), injury badge if applicable. The owner context is
 * the primary identifier for friend-league play — "Babe Ruth on Big
 * Thumps in Stanton League" is more useful than "Babe Ruth in
 * Stanton League" because there are usually 10+ teams per league and
 * the same player can only be on one of them.
 *
 * Sort options:
 *   - Lineup  — starters first (group: STARTERS / BENCH), alpha within
 *   - Position — grouped by display_position (QB / RB / WR / ...)
 *   - Team    — grouped by owning fantasy team name
 *
 * Selection is stored as an array of Yahoo `player_key` strings in
 * `prefs.channelDisplay.fantasy.followedPlayerKeys`. The picker
 * itself doesn't manage the data — it surfaces what the parent has
 * and emits change events.
 */
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions } from "../../api/queries";
import type { LeagueResponse, RosterPlayer } from "../../channels/fantasy/types";

type SortMode = "lineup" | "position" | "team";

interface PlayerEntry {
  player: RosterPlayer;
  leagueName: string;
  ownerTeamName: string;
}

interface FollowedPlayersPickerProps {
  followedPlayerKeys: string[];
  onChange: (next: string[]) => void;
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "lineup", label: "Lineup" },
  { value: "position", label: "Position" },
  { value: "team", label: "Owner" },
];

export default function FollowedPlayersPicker({
  followedPlayerKeys,
  onChange,
}: FollowedPlayersPickerProps) {
  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const fantasyData = dashboard?.data?.fantasy as
    | { leagues?: LeagueResponse[] }
    | undefined;
  const leagues = fantasyData?.leagues ?? [];

  // Aggregate every roster player across every league. Deduplicate by
  // player_key — the same player can appear in only one of YOUR
  // rosters (you can't own them twice in a single league) but a player
  // could exist on different rosters across DIFFERENT leagues. Keep
  // only the first occurrence to avoid duplicate picker rows; users
  // can pick once and the chip resolves to whatever league owns them
  // at render time.
  const allPlayers = useMemo<PlayerEntry[]>(() => {
    const seen = new Set<string>();
    const out: PlayerEntry[] = [];
    for (const league of leagues) {
      if (!league.rosters) continue;
      for (const roster of league.rosters) {
        for (const player of roster.data.players) {
          if (seen.has(player.player_key)) continue;
          seen.add(player.player_key);
          out.push({
            player,
            leagueName: league.name,
            ownerTeamName: roster.data.team_name,
          });
        }
      }
    }
    return out;
  }, [leagues]);

  const [filter, setFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("lineup");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allPlayers;
    return allPlayers.filter(({ player, leagueName, ownerTeamName }) => {
      return (
        player.name.full.toLowerCase().includes(q) ||
        player.name.last.toLowerCase().includes(q) ||
        player.editorial_team_abbr.toLowerCase().includes(q) ||
        player.display_position.toLowerCase().includes(q) ||
        player.selected_position.toLowerCase().includes(q) ||
        leagueName.toLowerCase().includes(q) ||
        ownerTeamName.toLowerCase().includes(q)
      );
    });
  }, [allPlayers, filter]);

  // Group + sort the filtered list according to the current sort mode.
  // `null` group means "ungrouped" — the picker renders a flat list
  // when sortMode is "lineup".
  const groups = useMemo<
    Array<{ key: string; title: string | null; rows: PlayerEntry[] }>
  >(() => {
    if (sortMode === "lineup") {
      const starters: PlayerEntry[] = [];
      const bench: PlayerEntry[] = [];
      for (const entry of filtered) {
        if (isBenchSlot(entry.player.selected_position)) bench.push(entry);
        else starters.push(entry);
      }
      const byLast = (a: PlayerEntry, b: PlayerEntry) =>
        a.player.name.last.localeCompare(b.player.name.last);
      return [
        { key: "STARTERS", title: starters.length ? "Starters" : null, rows: starters.sort(byLast) },
        { key: "BENCH", title: bench.length ? "Bench / IR" : null, rows: bench.sort(byLast) },
      ].filter((g) => g.rows.length > 0);
    }

    if (sortMode === "position") {
      const map = new Map<string, PlayerEntry[]>();
      for (const entry of filtered) {
        const pos = positionGroupKey(entry.player.display_position);
        if (!map.has(pos)) map.set(pos, []);
        map.get(pos)!.push(entry);
      }
      const orderedKeys = sortPositionGroups(Array.from(map.keys()));
      return orderedKeys.map((pos) => ({
        key: pos,
        title: pos,
        rows: map
          .get(pos)!
          .sort((a, b) => a.player.name.last.localeCompare(b.player.name.last)),
      }));
    }

    // sortMode === "team" — group by owning fantasy team. Within each
    // team, order by lineup (starters first, alpha) so the user's own
    // team always reads as a depth chart.
    const map = new Map<string, PlayerEntry[]>();
    for (const entry of filtered) {
      const key = entry.ownerTeamName || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    const teamKeys = Array.from(map.keys()).sort((a, b) =>
      a.localeCompare(b),
    );
    return teamKeys.map((team) => ({
      key: team,
      title: team,
      rows: map.get(team)!.sort((a, b) => {
        const aBench = isBenchSlot(a.player.selected_position);
        const bBench = isBenchSlot(b.player.selected_position);
        if (aBench !== bBench) return aBench ? 1 : -1;
        return a.player.name.last.localeCompare(b.player.name.last);
      }),
    }));
  }, [filtered, sortMode]);

  const followedSet = useMemo(
    () => new Set(followedPlayerKeys),
    [followedPlayerKeys],
  );

  function togglePlayer(key: string) {
    const next = new Set(followedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  }

  function clearAll() {
    onChange([]);
  }

  // ── Empty states ────────────────────────────────────────────

  if (leagues.length === 0) {
    return (
      <div className="px-3 py-4 text-[12px] text-fg-3">
        Import a Fantasy league first to pick players to follow.
      </div>
    );
  }

  if (allPlayers.length === 0) {
    return (
      <div className="px-3 py-4 text-[12px] text-fg-3">
        Rosters are still syncing. Followed-player picker will appear once
        roster data arrives — usually within a minute of importing a league.
      </div>
    );
  }

  return (
    <div className="px-1">
      {/* ── Header strip: count + sort + search + clear ────── */}
      <div className="flex flex-col gap-2 px-2 pb-2 mb-2 border-b border-edge/30">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-fg-3 tabular-nums shrink-0">
            {followedPlayerKeys.length} tracked
          </span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, team, position, or league..."
            aria-label="Filter players"
            className={clsx(
              "flex-1 min-w-0 text-[12px] text-fg-2 placeholder:text-fg-4",
              "bg-base-200 px-2 py-1 rounded-md",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            )}
          />
          {followedPlayerKeys.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="shrink-0 text-[11px] text-fg-4 hover:text-fg-2 px-2 py-1 rounded-md hover:bg-base-250/50 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Sort selector — segmented control matching the design
            language used elsewhere in Settings. */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-fg-4 shrink-0">
            Sort
          </span>
          <div
            role="radiogroup"
            aria-label="Sort players"
            className="inline-flex items-center rounded-lg bg-base-200 p-0.5"
          >
            {SORT_OPTIONS.map((opt) => {
              const selected = sortMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSortMode(opt.value)}
                  className={clsx(
                    "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200 cursor-pointer leading-none",
                    selected
                      ? "bg-base-300 text-fg shadow-sm"
                      : "text-fg-3 hover:text-fg-2",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Player list ───────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-[12px] text-fg-4 text-center">
          No players match "{filter}".
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.key}>
              {group.title && (
                <div className="px-2 pt-2 pb-1">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-fg-4">
                    {group.title}
                  </span>
                </div>
              )}
              {group.rows.map(({ player, leagueName, ownerTeamName }) => {
                const checked = followedSet.has(player.player_key);
                const benched = isBenchSlot(player.selected_position);
                return (
                  <PlayerRow
                    key={player.player_key}
                    player={player}
                    leagueName={leagueName}
                    ownerTeamName={ownerTeamName}
                    checked={checked}
                    benched={benched}
                    onToggle={() => togglePlayer(player.player_key)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single picker row ─────────────────────────────────────────

interface PlayerRowProps {
  player: RosterPlayer;
  leagueName: string;
  ownerTeamName: string;
  checked: boolean;
  benched: boolean;
  onToggle: () => void;
}

function PlayerRow({
  player,
  leagueName,
  ownerTeamName,
  checked,
  benched,
  onToggle,
}: PlayerRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={clsx(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left",
        "hover:bg-base-250/40 transition-colors cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      )}
      aria-pressed={checked}
      aria-label={`${checked ? "Untrack" : "Track"} ${player.name.full}`}
    >
      {/* Checkbox indicator */}
      <span
        className={clsx(
          "shrink-0 h-[18px] w-[18px] rounded-md flex items-center justify-center transition-colors",
          checked
            ? "bg-accent text-on-accent"
            : "bg-base-300 border border-edge/40",
        )}
        aria-hidden="true"
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3 w-3">
            <path
              d="M2 6.5l2.5 2.5L10 3.5"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        )}
      </span>

      {/* Position badge — selected_position (lineup slot) */}
      <span
        className={clsx(
          "shrink-0 inline-flex items-center justify-center min-w-[28px] px-1 py-0 rounded text-[9px] font-semibold uppercase tracking-wide tabular-nums",
          benched
            ? "bg-fg-3/10 text-fg-4"
            : "bg-accent/15 text-accent",
        )}
      >
        {player.selected_position || player.display_position || "?"}
      </span>

      {/* Name + meta — two-line for clarity. Top: full name, real-team
          abbr, display position. Bottom: owner team · league. */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[12px] text-fg-2 truncate">
            {player.name.full}
          </span>
          <span className="text-[10px] text-fg-4 shrink-0 tabular-nums">
            {player.editorial_team_abbr || "—"} · {player.display_position}
          </span>
        </div>
        <div className="flex items-baseline gap-1 min-w-0 text-[10px] text-fg-4">
          <span className="text-fg-3 truncate">{ownerTeamName}</span>
          <span className="text-fg-4/60">·</span>
          <span className="truncate">{leagueName}</span>
        </div>
      </div>

      {/* Injury badge */}
      {isInjuredStatus(player.status) && (
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1 rounded bg-down/15 text-down">
          {shortStatus(player.status)}
        </span>
      )}
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────
// (mirrors FollowedPlayerChip — kept local to avoid a shared util
// module just for these small helpers)

function isBenchSlot(pos: string): boolean {
  if (!pos) return true;
  const p = pos.toUpperCase();
  return p === "BN" || p === "IR" || p === "IL" || p === "NA" || p.startsWith("IR") || p.startsWith("IL");
}

function isInjuredStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toUpperCase();
  if (s === "" || s === "HEALTHY" || s === "P") return false;
  return true;
}

function shortStatus(status: string | null | undefined): string {
  if (!status) return "";
  const s = status.trim().toUpperCase();
  if (s.startsWith("IR")) return "IR";
  return s;
}

/** Collapse Yahoo's display_position values into broader groups. The
 *  goal is sane sorting / grouping, not perfect categorization —
 *  multi-position players (e.g. "WR,KR") collapse to their first
 *  primary slot. */
function positionGroupKey(displayPos: string | undefined): string {
  if (!displayPos) return "?";
  // Take the first comma-separated position for the group key.
  const first = displayPos.split(",")[0]?.trim().toUpperCase() || "?";
  return first;
}

/** Football positions in conventional fantasy order; everything
 *  unknown sorts last alphabetically. Other sports just sort
 *  alphabetically since they don't have a universal lineup convention. */
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "DST", "D/ST"];
function sortPositionGroups(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a);
    const bi = POSITION_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}
