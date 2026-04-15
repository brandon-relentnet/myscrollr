import { useState, useMemo } from "react";
import { Star, X } from "lucide-react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import Tooltip from "../../components/Tooltip";
import UpgradePrompt from "../../components/UpgradePrompt";
import { sportsTeamsOptions } from "../../api/queries";
import { formatCountdown } from "../../utils/gameHelpers";
import type { TrackedLeague, TeamInfo } from "../../api/queries";
import type { FavoriteTeam } from "../../hooks/useSportsConfig";
import type { SubscriptionTier } from "../../auth";

// ── Types ────────────────────────────────────────────────────────

interface MyLeaguesProps {
  leagues: string[];
  catalog: TrackedLeague[];
  favoriteTeams: Record<string, FavoriteTeam>;
  onRemove: (name: string) => void;
  onSetFavoriteTeam: (league: string, team: FavoriteTeam | null) => void;
  leagueCount: number;
  maxLeagues: number;
  subscriptionTier: SubscriptionTier;
  saving: boolean;
}

type SortKey = "name" | "live" | "sport";

// ── TeamPicker (internal) ────────────────────────────────────────

function TeamPicker({
  league,
  selected,
  onSelect,
  disabled,
}: {
  league: string;
  selected: FavoriteTeam | undefined;
  onSelect: (team: FavoriteTeam | null) => void;
  disabled: boolean;
}) {
  const { data, isLoading } = useQuery(sportsTeamsOptions(league));
  const teams: TeamInfo[] = data?.teams ?? [];

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Tooltip content={selected ? `Favorite: ${selected.teamName}` : "Pick favorite team"}>
        <Star
          size={12}
          className={clsx(
            "shrink-0 transition-colors",
            selected
              ? "text-[#f97316] fill-[#f97316]"
              : "text-fg-3",
          )}
        />
      </Tooltip>
      <select
        value={selected?.teamId ?? ""}
        disabled={disabled || isLoading || teams.length === 0}
        onChange={(e) => {
          const id = Number(e.target.value);
          if (!id) {
            onSelect(null);
            return;
          }
          const team = teams.find((t) => t.external_id === id);
          if (team) onSelect({ teamId: team.external_id, teamName: team.name });
        }}
        className="px-1.5 py-0.5 rounded bg-base-200 border border-edge/30 text-[10px] text-fg-2 focus:outline-none focus:border-accent/60 transition-colors cursor-pointer appearance-none max-w-[100px] disabled:opacity-40"
      >
        <option value="">
          {isLoading ? "Loading..." : "No team"}
        </option>
        {teams.map((t) => (
          <option key={t.external_id} value={t.external_id}>
            {t.name}
          </option>
        ))}
      </select>
      {selected && (
        <Tooltip content="Clear favorite">
          <button
            onClick={() => onSelect(null)}
            disabled={disabled}
            className="p-0.5 rounded hover:bg-[#f97316]/10 text-fg-3 hover:text-[#f97316] transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Clear favorite team"
          >
            <X size={10} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

// ── Status Display ───────────────────────────────────────────────

function LeagueStatus({ entry }: { entry: TrackedLeague | undefined }) {
  if (!entry) {
    return <span className="text-[10px] text-fg-3">--</span>;
  }

  if (entry.live_count > 0) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-live tabular-nums">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-live opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-live" />
        </span>
        {entry.live_count} Live
      </span>
    );
  }

  if (entry.game_count > 0) {
    return (
      <span className="text-[10px] text-fg-3 tabular-nums">
        {entry.game_count} game{entry.game_count !== 1 ? "s" : ""}
      </span>
    );
  }

  if (entry.is_offseason) {
    return <span className="text-[10px] text-fg-3">Off-season</span>;
  }

  if (entry.next_game) {
    return (
      <Tooltip content={`Next game: ${new Date(entry.next_game).toLocaleString()}`}>
        <span className="text-[10px] text-fg-3 tabular-nums">
          {formatCountdown(entry.next_game)}
        </span>
      </Tooltip>
    );
  }

  return <span className="text-[10px] text-fg-3">--</span>;
}

// ── Component ────────────────────────────────────────────────────

export default function MyLeagues({
  leagues,
  catalog,
  favoriteTeams,
  onRemove,
  onSetFavoriteTeam,
  leagueCount,
  maxLeagues,
  subscriptionTier,
  saving,
}: MyLeaguesProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const catalogMap = useMemo(
    () => new Map(catalog.map((l) => [l.name, l])),
    [catalog],
  );

  const atLimit = leagueCount >= maxLeagues;

  // Filter + sort leagues
  const sortedLeagues = useMemo(() => {
    let list = leagues;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((name) => {
        const entry = catalogMap.get(name);
        return (
          name.toLowerCase().includes(q) ||
          entry?.country?.toLowerCase().includes(q) ||
          entry?.category?.toLowerCase().includes(q)
        );
      });
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.localeCompare(b);
        case "live": {
          const aEntry = catalogMap.get(a);
          const bEntry = catalogMap.get(b);
          const aLive = aEntry?.live_count ?? 0;
          const bLive = bEntry?.live_count ?? 0;
          if (aLive !== bLive) return bLive - aLive;
          const aGames = aEntry?.game_count ?? 0;
          const bGames = bEntry?.game_count ?? 0;
          return bGames - aGames;
        }
        case "sport": {
          const aCat = catalogMap.get(a)?.category ?? "zzz";
          const bCat = catalogMap.get(b)?.category ?? "zzz";
          return aCat.localeCompare(bCat) || a.localeCompare(b);
        }
        default:
          return 0;
      }
    });
  }, [leagues, search, sort, catalogMap]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            My Leagues
            <span className="bg-[#f97316]/15 text-[#f97316] px-1.5 py-px rounded-full text-[11px] font-medium tabular-nums">
              {leagueCount}
            </span>
          </div>
          <p className="text-[11px] text-fg-3 mt-0.5">
            Manage your tracked sports leagues
          </p>
        </div>
      </div>

      {/* Upgrade prompt when at league limit */}
      {atLimit && (
        <UpgradePrompt
          current={leagueCount}
          max={maxLeagues}
          noun="leagues"
          tier={subscriptionTier}
        />
      )}

      {/* Search + Sort controls */}
      {leagues.length > 0 && (
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter leagues..."
            className="flex-1 px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 placeholder:text-fg-3 focus:outline-none focus:border-accent/60 transition-colors"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 focus:outline-none focus:border-accent/60 transition-colors cursor-pointer appearance-none"
          >
            <option value="name">Sort: Name</option>
            <option value="live">Sort: Live Activity</option>
            <option value="sport">Sort: Sport</option>
          </select>
        </div>
      )}

      {/* League list */}
      {sortedLeagues.length > 0 ? (
        <div className="border border-edge/30 rounded-lg overflow-hidden divide-y divide-edge/20">
          {sortedLeagues.map((name) => {
            const entry = catalogMap.get(name);
            return (
              <div
                key={name}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-base-200/50 transition-colors"
              >
                {/* League logo */}
                {entry?.logo_url ? (
                  <img
                    src={entry.logo_url}
                    alt=""
                    className="w-5 h-5 rounded-sm object-contain shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-sm bg-edge/30 shrink-0" />
                )}

                {/* Name + country */}
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium text-fg-2 truncate block">
                    {name}
                  </span>
                  {entry?.country && (
                    <span className="text-[10px] text-fg-3 truncate block">
                      {entry.country}
                    </span>
                  )}
                </div>

                {/* Sport category badge */}
                <span className="px-1.5 py-px rounded text-[9px] text-fg-3 bg-[#f97316]/10 shrink-0">
                  {entry?.category ?? ""}
                </span>

                {/* Live / game status */}
                <div className="w-16 text-right shrink-0">
                  <LeagueStatus entry={entry} />
                </div>

                {/* Favorite team picker */}
                <TeamPicker
                  league={name}
                  selected={favoriteTeams[name]}
                  onSelect={(team) => onSetFavoriteTeam(name, team)}
                  disabled={saving}
                />

                {/* Remove button */}
                <Tooltip content="Remove league">
                  <button
                    onClick={() => onRemove(name)}
                    disabled={saving}
                    className="p-1 rounded hover:bg-error/10 text-fg-3 hover:text-error transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                    aria-label={`Remove ${name}`}
                  >
                    <X size={12} />
                  </button>
                </Tooltip>
              </div>
            );
          })}
        </div>
      ) : leagues.length > 0 ? (
        <p className="text-[11px] text-fg-3 text-center py-4">
          No leagues match your filter
        </p>
      ) : (
        <p className="text-[11px] text-fg-3 text-center py-4">
          No leagues added yet. Browse the catalog below to add some.
        </p>
      )}

      {/* Tier limit footer */}
      {leagues.length > 0 && (
        <p className="text-[10px] text-fg-3 text-right tabular-nums">
          {leagueCount} / {maxLeagues === Infinity ? "\u221E" : maxLeagues} leagues
        </p>
      )}
    </div>
  );
}
