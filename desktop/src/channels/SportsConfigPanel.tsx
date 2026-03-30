import { useCallback, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SetupBrowser } from "../components/settings/SetupBrowser";
import UpgradePrompt from "../components/UpgradePrompt";
import { useSportsConfig } from "../hooks/useSportsConfig";
import { formatCountdown } from "../utils/gameHelpers";
import { sportsCatalogOptions } from "../api/queries";
import { getLimit, maxItemsForBrowser } from "../tierLimits";
import type { TrackedLeague } from "../api/queries";
import type { Channel } from "../api/client";
import type { SubscriptionTier } from "../auth";

// ── Types ────────────────────────────────────────────────────────

interface SportsConfigPanelProps {
  channel: Channel;
  subscriptionTier: SubscriptionTier;
  connected: boolean;
  hex: string;
}

// ── Component ────────────────────────────────────────────────────

export default function SportsConfigPanel({
  subscriptionTier,
  hex,
}: SportsConfigPanelProps) {
  const { leagues, setLeagues, saving } =
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
          <>
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
          </>
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
