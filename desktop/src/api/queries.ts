/**
 * TanStack Query hooks for the desktop API layer.
 *
 * Centralizes all query keys, query options, and mutation helpers.
 * Every remote data fetch uses this layer — no manual fetch + useState.
 */
import { queryOptions } from "@tanstack/react-query";
import { isAuthenticated } from "../auth";
import { authFetch, request, rssApi } from "./client";
import type { TrackedFeed } from "./client";
import type { DashboardResponse } from "../types";

// ── Query Keys ───────────────────────────────────────────────────

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  catalogs: {
    sports: ["catalogs", "sports"] as const,
    finance: ["catalogs", "finance"] as const,
    rss: ["catalogs", "rss"] as const,
  },
  fantasy: {
    status: ["fantasy", "status"] as const,
    leagues: ["fantasy", "leagues"] as const,
  },
  standings: (league: string) => ["standings", league] as const,
};

// ── Dashboard Query ──────────────────────────────────────────────

async function fetchDashboard(): Promise<DashboardResponse> {
  if (isAuthenticated()) {
    try {
      const data = await authFetch<{
        data: DashboardResponse["data"];
        channels?: DashboardResponse["channels"];
        preferences?: DashboardResponse["preferences"];
      }>("/dashboard");
      return {
        data: data.data,
        channels: data.channels,
        preferences: data.preferences,
      } as DashboardResponse;
    } catch {
      // Token rejected or expired — fall back to public feed
    }
  }

  const data = await request<{ data: DashboardResponse["data"] }>("/public/feed");
  return { data: data.data } as DashboardResponse;
}

/** Query options for the dashboard — usable in route loaders and components. */
export function dashboardQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.dashboard,
    queryFn: fetchDashboard,
    staleTime: 10_000,
  });
}

// ── Catalog Queries ──────────────────────────────────────────────

export interface TrackedLeague {
  name: string;
  sport_api: string;
  category: string;
  country: string;
  logo_url: string;
  game_count: number;
  live_count: number;
  next_game: string | null;
  is_offseason: boolean;
}

export interface TrackedSymbol {
  symbol: string;
  name: string;
  category: string;
}

export interface Standing {
  league: string;
  team_name: string;
  team_code: string;
  team_logo: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  games_played: number;
  goal_diff: number;
  description?: string;
  form?: string;
  group_name?: string;
}

export function standingsOptions(league: string) {
  return queryOptions({
    queryKey: queryKeys.standings(league),
    queryFn: () => request<{ standings: Standing[] }>(`/sports/standings?league=${encodeURIComponent(league)}`),
    staleTime: 60 * 60 * 1000, // 1 hour
    enabled: !!league,
  });
}

export function sportsCatalogOptions() {
  return queryOptions({
    queryKey: queryKeys.catalogs.sports,
    queryFn: () => request<TrackedLeague[]>("/sports/leagues"),
    staleTime: 5 * 60 * 1000, // 5 min — catalogs change infrequently
  });
}

export function financeCatalogOptions() {
  return queryOptions({
    queryKey: queryKeys.catalogs.finance,
    queryFn: () => request<TrackedSymbol[]>("/finance/symbols"),
    staleTime: 5 * 60 * 1000,
  });
}

export function rssCatalogOptions() {
  return queryOptions({
    queryKey: queryKeys.catalogs.rss,
    queryFn: () => rssApi.getCatalog(),
    staleTime: 5 * 60 * 1000,
  });
}

// ── Fantasy Queries ─────────────────────────────────────────────

interface YahooStatusResponse {
  connected: boolean;
  synced: boolean;
}

interface MyLeaguesResponse {
  leagues: Array<{
    league_key: string;
    name: string;
    game_code: string;
    season: string;
    team_key: string | null;
    team_name: string | null;
    data: {
      num_teams: number;
      is_finished: boolean;
      current_week: number | null;
      scoring_type: string;
      [k: string]: unknown;
    };
    standings: unknown[] | null;
    matchups: unknown[] | null;
    rosters: unknown[] | null;
  }>;
}

export function fantasyStatusOptions() {
  return queryOptions({
    queryKey: queryKeys.fantasy.status,
    queryFn: () =>
      authFetch<YahooStatusResponse>("/users/me/yahoo-status"),
    staleTime: 30_000,
    retry: false,
  });
}

export function fantasyLeaguesOptions() {
  return queryOptions({
    queryKey: queryKeys.fantasy.leagues,
    queryFn: () =>
      authFetch<MyLeaguesResponse>("/users/me/yahoo-leagues"),
    staleTime: 30_000,
    retry: false,
  });
}

// ── Weather Queries ──────────────────────────────────────────────

import { searchCities, fetchWeather } from "../widgets/weather/types";
import type { WeatherLocation, CurrentWeather } from "../widgets/weather/types";

export type { WeatherLocation, CurrentWeather };

export function weatherQueryOptions(lat: number, lon: number) {
  return queryOptions({
    queryKey: ["weather", lat, lon] as const,
    queryFn: () => fetchWeather(lat, lon),
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 30 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000, // auto-refetch every 10 min
  });
}

export function citySearchOptions(query: string) {
  return queryOptions({
    queryKey: ["city-search", query] as const,
    queryFn: () => searchCities(query),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
