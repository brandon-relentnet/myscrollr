import { useCallback, useMemo, useState } from "react";
import { Trophy, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SetupBrowser } from "../components/settings/SetupBrowser";
import UpgradePrompt from "../components/UpgradePrompt";
import { useSportsConfig } from "../hooks/useSportsConfig";
import { formatCountdown } from "../utils/gameHelpers";
import {
  sportsCatalogOptions,
  sportsTeamsOptions,
  sportsFightersOptions,
} from "../api/queries";
import { getLimit, maxItemsForBrowser } from "../tierLimits";
import type { TrackedLeague } from "../api/queries";
import type { Channel } from "../api/client";
import type { SubscriptionTier } from "../auth";
import type { TeamInfo, FighterInfo } from "../api/queries";

// Leagues that use fighters instead of teams (MMA)
const FIGHTER_LEAGUES = new Set(["UFC"]);

// ── Types ────────────────────────────────────────────────────────────

interface SportsConfigPanelProps {
  channel: Channel;
  subscriptionTier: SubscriptionTier;
  connected: boolean;
  hex: string;
}

// ── Component ──────────────────────────────────────────────────────

export default function SportsConfigPanel({
  subscriptionTier,
  hex,
}: SportsConfigPanelProps) {
  const { leagues, setLeagues, favoriteTeams, setFavoriteTeam, saving } =
    useSportsConfig();
  const [error, setError] = useState<string | null>(null);

  const leagueSet = useMemo(() => new Set(leagues), [leagues]);

  const maxLeagues = getLimit(subscriptionTier, "leagues");
  const atLimit = leagues.length >= maxLeagues;

  // ── Catalog query ──────────────────────────────────────────────
  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery(sportsCatalogOptions());

  // Sort catalog: live first, then by game count, then alpha
  const sortedCatalog = useMemo(
    () =>
      [...catalog].sort((a, b) => {
        if (a.live_count !== b.live_count) return b.live_count - a.live_count;
        if (a.game_count !== b.game_count) return b.game_count - a.game_count;
        return a.name.localeCompare(b.name);
      }),
    [catalog],
  );

  const addLeague = useCallback(
    (name: string) => {
      if (leagueSet.has(name)) return;
      if (leagues.length >= maxLeagues) return;
      setLeagues([...leagues, name]);
    },
    [leagues, leagueSet, setLeagues, maxLeagues],
  );

  const removeLeague = useCallback(
    (name: string) => {
      setLeagues(leagues.filter((l) => l !== name));
    },
    [leagues, setLeagues],
  );

  // ── Inline favorite picker for selected leagues ─────────────────────
  // Uses fighters for MMA leagues, teams for everything else
  function InlineFavoritePicker({ league }: { league: string }) {
    const isFighterLeague = FIGHTER_LEAGUES.has(league);

    // Query teams or fighters based on league type
    const { data: teamsData, isLoading: teamsLoading } = useQuery({
      ...sportsTeamsOptions(league),
      enabled: !isFighterLeague,
    });
    const { data: fightersData, isLoading: fightersLoading } = useQuery({
      ...sportsFightersOptions(league),
      enabled: isFighterLeague,
    });

    const isLoading = isFighterLeague ? fightersLoading : teamsLoading;
    const items: Array<{ external_id: number; name: string }> = isFighterLeague
      ? (fightersData?.fighters ?? [])
      : (teamsData?.teams ?? []);

    const current = favoriteTeams[league];
    const label = isFighterLeague ? "Fighter" : "Team";

    return (
      <div
        className="flex items-center gap-2 mt-2 pt-2 border-t border-edge/10"
        onClick={(e) => e.stopPropagation()}
      >
        <Star className="w-3 h-3 text-fg-4 shrink-0" />
        <span className="text-[10px] text-fg-4 shrink-0">Favorite {label}:</span>
        <select
          className="text-[11px] bg-bg-2 border border-bg-4 rounded px-2 py-1 text-fg-2 min-w-[120px] flex-1"
          value={current?.teamName ?? ""}
          onChange={(e) => {
            const selected = items.find((item) => item.name === e.target.value);
            if (selected) {
              setFavoriteTeam(league, {
                teamId: selected.external_id,
                teamName: selected.name,
              });
            } else {
              setFavoriteTeam(league, null);
            }
          }}
          disabled={isLoading}
        >
          <option value="">{isLoading ? "Loading..." : "None"}</option>
          {items.map((item) => (
            <option key={item.external_id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        {current && (
          <button
            type="button"
            className="text-[10px] text-fg-4 hover:text-fg-2 px-1"
            onClick={(e) => {
              e.stopPropagation();
              setFavoriteTeam(league, null);
            }}
          >
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {atLimit && (
        <div className="mb-4 px-3">
          <UpgradePrompt
            current={leagues.length}
            max={maxLeagues}
            noun="leagues"
            tier={subscriptionTier}
          />
        </div>
      )}

      <SetupBrowser
        title="Sports"
        subtitle="Live scores from your favorite leagues"
        icon={Trophy}
        hex={hex}
        items={sortedCatalog}
        selectedKeys={leagueSet}
        getKey={(l: TrackedLeague) => l.name}
        getCategory={(l: TrackedLeague) => l.category}
        matchesSearch={(l: TrackedLeague, q: string) => {
          const lower = q.toLowerCase();
          return (
            l.name.toLowerCase().includes(lower) ||
            l.category.toLowerCase().includes(lower)
          );
        }}
        renderItem={(item: TrackedLeague, isSelected: boolean) => (
          <div className="w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 mr-2">
                {item.logo_url && (
                  <img
                    src={item.logo_url}
                    alt={item.name}
                    className="w-5 h-5 object-contain shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-fg-2">
                    {item.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-fg-4 truncate">
                    <span>{item.country}</span>
                    {item.live_count > 0 && (
                      <span className="flex items-center gap-0.5 text-live font-bold">
                        <span className="w-1 h-1 rounded-full bg-live animate-pulse" />
                        {item.live_count} Live
                      </span>
                    )}
                    {item.live_count === 0 && item.game_count > 0 && (
                      <span>{item.game_count} games</span>
                    )}
                    {item.game_count === 0 && (
                      <span className="text-fg-4/60">
                        {item.is_offseason
                          ? "Off-season"
                          : item.next_game
                            ? `Next: ${formatCountdown(item.next_game)}`
                            : "No games scheduled"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span
                className="text-[10px] font-medium shrink-0"
                style={isSelected ? { color: hex } : undefined}
              >
                {isSelected ? "\u2713 Added" : "+ Add"}
              </span>
            </div>
            {isSelected && <InlineFavoritePicker league={item.name} />}
          </div>
        )}
        searchPlaceholder="Search by league or sport..."
        error={error}
        onDismissError={() => setError(null)}
        loading={catalogLoading}
        catalogError={catalogError}
        saving={saving}
        maxItems={maxItemsForBrowser(subscriptionTier, "leagues")}
        onAdd={addLeague}
        onRemove={removeLeague}
        onBulkAdd={(keys: string[]) => {
          const capacity = maxLeagues - leagues.length;
          if (capacity <= 0) return;
          setLeagues([...leagues, ...keys.slice(0, capacity)]);
        }}
        onBulkRemove={(keys: string[]) => {
          const toRemove = new Set(keys);
          setLeagues(leagues.filter((l) => !toRemove.has(l)));
        }}
        onClearAll={() => setLeagues([])}
      />
    </div>
  );
}
