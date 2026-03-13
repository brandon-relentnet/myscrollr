/**
 * TanStack Query hooks for the desktop API layer.
 *
 * Centralizes all query keys, query options, and mutation helpers.
 * Every remote data fetch uses this layer — no manual fetch + useState.
 */
import { queryOptions } from "@tanstack/react-query";
import { fetch } from "@tauri-apps/plugin-http";
import { API_BASE } from "../config";
import { getValidToken } from "../auth";
import { request } from "./client";
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
};

// ── Dashboard Query ──────────────────────────────────────────────

async function fetchDashboard(): Promise<DashboardResponse> {
  const token = await getValidToken();

  if (token) {
    const res = await fetch(`${API_BASE}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      // Token rejected — fall back to public feed
      const anonRes = await fetch(`${API_BASE}/public/feed`);
      if (!anonRes.ok) throw new Error(`Server returned ${anonRes.status}`);
      const data = await anonRes.json();
      return { data: data.data } as DashboardResponse;
    }

    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    return {
      data: data.data,
      channels: data.channels,
      preferences: data.preferences,
    } as DashboardResponse;
  }

  // Not authenticated — public feed only
  const res = await fetch(`${API_BASE}/public/feed`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const data = await res.json();
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
}

export interface TrackedSymbol {
  symbol: string;
  name: string;
  category: string;
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
    queryFn: () => request<Array<TrackedFeed>>("/rss/feeds"),
    staleTime: 5 * 60 * 1000,
  });
}
