/**
 * Atomic config hook for sports channel.
 *
 * Reads the full config, merges changes locally, and writes the complete
 * object to avoid data loss from the partial-write behavior of useChannelConfig.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { channelsApi } from "../api/client";
import { queryKeys } from "../api/queries";
import { useShellData } from "../shell-context";

export interface FavoriteTeam {
  teamId: number;
  teamName: string;
}

export interface SportsDisplayPrefs {
  showUpcoming: boolean;
  showFinal: boolean;
  showLogos: boolean;
  showTimer: boolean;
  compact: boolean;
  stats: boolean;
}

export interface SportsConfig {
  leagues: string[];
  display: SportsDisplayPrefs;
  favoriteTeams: Record<string, FavoriteTeam>;
}

const DEFAULT_DISPLAY: SportsDisplayPrefs = {
  showUpcoming: true,
  showFinal: true,
  showLogos: true,
  showTimer: true,
  compact: true,
  stats: true,
};

export function useSportsConfig() {
  const { channels } = useShellData();
  const queryClient = useQueryClient();

  // Read current config from the channels data (comes via dashboard response)
  const sportsChannel = channels.find((c) => c.channel_type === "sports");
  const raw = (sportsChannel?.config ?? {}) as Record<string, unknown>;

  const config: SportsConfig = useMemo(
    () => ({
      leagues: Array.isArray(raw.leagues) ? (raw.leagues as string[]) : [],
      display: {
        ...DEFAULT_DISPLAY,
        ...(typeof raw.display === "object" && raw.display !== null
          ? (raw.display as Partial<SportsDisplayPrefs>)
          : {}),
      },
      favoriteTeams:
        typeof raw.favoriteTeams === "object" && raw.favoriteTeams !== null
          ? (raw.favoriteTeams as Record<string, FavoriteTeam>)
          : {},
    }),
    [raw],
  );

  const mutation = useMutation({
    mutationFn: (next: SportsConfig) =>
      channelsApi.update("sports", {
        config: next as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    onError: () => {
      toast.error("Failed to save \u2014 try again");
    },
  });

  const setLeagues = useCallback(
    (leagues: string[]) => mutation.mutate({ ...config, leagues }),
    [config, mutation],
  );

  const setDisplay = useCallback(
    (partial: Partial<SportsDisplayPrefs>) =>
      mutation.mutate({
        ...config,
        display: { ...config.display, ...partial },
      }),
    [config, mutation],
  );

  const setFavoriteTeam = useCallback(
    (league: string, team: FavoriteTeam | null) => {
      const newFavorites = { ...config.favoriteTeams };
      if (team) {
        newFavorites[league] = team;
      } else {
        delete newFavorites[league];
      }
      mutation.mutate({ ...config, favoriteTeams: newFavorites });
    },
    [config, mutation],
  );

  return {
    config,
    leagues: config.leagues,
    display: config.display,
    favoriteTeams: config.favoriteTeams,
    setLeagues,
    setDisplay,
    setFavoriteTeam,
    saving: mutation.isPending,
  };
}
