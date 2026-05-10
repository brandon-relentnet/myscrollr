import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import LeagueManager from "./LeagueManager";
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

  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogError,
  } = useQuery(sportsCatalogOptions());

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
    <div className="w-full max-w-2xl mx-auto h-full flex flex-col min-h-0 gap-3 pt-1">
      <div className="flex-1 min-h-0">
        <LeagueManager
          leagues={leagues}
          catalog={catalog}
          favoriteTeams={favoriteTeams}
          onAdd={addLeague}
          onRemove={removeLeague}
          onSetFavoriteTeam={setFavoriteTeam}
          loading={catalogLoading}
          error={catalogError}
          maxLeagues={maxLeagues}
          subscriptionTier={subscriptionTier}
          saving={saving}
        />
      </div>
    </div>
  );
}
