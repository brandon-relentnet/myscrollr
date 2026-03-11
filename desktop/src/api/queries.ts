/**
 * TanStack Query hooks for the desktop API layer.
 *
 * These replace the manual fetch + useState + useEffect patterns
 * that were previously spread across MainApp.tsx.
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetch } from "@tauri-apps/plugin-http";
import { API_BASE } from "../config";
import { getValidToken } from "../auth";
import type { ChannelType } from "./client";
import { channelsApi } from "./client";
import type { DashboardResponse } from "../types";

// ── Query Keys ───────────────────────────────────────────────────

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  publicFeed: ["public-feed"] as const,
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

// ── Channel Mutations ────────────────────────────────────────────

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelType,
      config = {},
    }: {
      channelType: ChannelType;
      config?: Record<string, unknown>;
    }) => {
      return channelsApi.create(
        channelType,
        config,
        () => getValidToken().then((t) => t ?? null),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelType,
      data,
    }: {
      channelType: ChannelType;
      data: { enabled?: boolean; visible?: boolean; config?: Record<string, unknown> };
    }) => {
      return channelsApi.update(
        channelType,
        data,
        () => getValidToken().then((t) => t ?? null),
      );
    },
    onSuccess: (_result, { channelType }) => {
      // Optimistically update the cached dashboard
      queryClient.setQueryData<DashboardResponse>(
        queryKeys.dashboard,
        (old) => {
          if (!old?.channels) return old;
          return {
            ...old,
            channels: old.channels.map((ch) =>
              ch.channel_type === channelType ? { ...ch, ..._result } : ch,
            ),
          };
        },
      );
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelType }: { channelType: ChannelType }) => {
      return channelsApi.delete(
        channelType,
        () => getValidToken().then((t) => t ?? null),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}


