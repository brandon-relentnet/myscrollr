import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import MyLeagues from "./MyLeagues";
import LeagueCatalog from "./LeagueCatalog";
import { useSportsConfig } from "../../hooks/useSportsConfig";
import { sportsCatalogOptions } from "../../api/queries";
import { getLimit } from "../../tierLimits";
import type { Channel } from "../../api/client";
import type { SubscriptionTier } from "../../auth";

// ── Types ────────────────────────────────────────────────────────

interface SportsConfigPanelProps {
  channel: Channel;
  subscriptionTier: SubscriptionTier;
  hex: string;
}

// ── Component ────────────────────────────────────────────────────

export default function SportsConfigPanel({
  channel: _channel,
  subscriptionTier,
}: SportsConfigPanelProps) {
  const { leagues, setLeagues, favoriteTeams, setFavoriteTeam, saving } =
    useSportsConfig();

  const leagueSet = useMemo(() => new Set(leagues), [leagues]);
  const maxLeagues = getLimit(subscriptionTier, "leagues");

  // ── Catalog query ──────────────────────────────────────────────

  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery(sportsCatalogOptions());

  // Sort: live first, then game count, then alphabetical
  const sortedCatalog = useMemo(
    () =>
      [...catalog].sort((a, b) => {
        if (a.live_count !== b.live_count) return b.live_count - a.live_count;
        if (a.game_count !== b.game_count) return b.game_count - a.game_count;
        return a.name.localeCompare(b.name);
      }),
    [catalog],
  );

  // ── Handlers ───────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-8">
      {/* Section 1: My Leagues */}
      <MyLeagues
        leagues={leagues}
        catalog={sortedCatalog}
        favoriteTeams={favoriteTeams}
        onRemove={removeLeague}
        onSetFavoriteTeam={setFavoriteTeam}
        leagueCount={leagues.length}
        maxLeagues={maxLeagues}
        subscriptionTier={subscriptionTier}
        saving={saving}
      />

      {/* Divider */}
      <div className="h-px bg-edge/30" />

      {/* Section 2: League Catalog */}
      <LeagueCatalog
        catalog={sortedCatalog}
        subscribedNames={leagueSet}
        onAdd={addLeague}
        loading={catalogLoading}
        error={catalogError}
        atLimit={leagues.length >= maxLeagues}
      />
    </div>
  );
}
