/**
 * Desktop API client — mirrors myscrollr.com/src/api/client.ts but uses
 * `fetch` from `@tauri-apps/plugin-http` to bypass browser CORS.
 *
 * DashboardTab components import from `@/api/client`. The Vite alias
 * resolves `@/api/client` to this file (desktop override), so all API
 * calls route through Tauri's reqwest-backed fetch automatically.
 */
import { fetch } from "@tauri-apps/plugin-http";

// ── Constants ────────────────────────────────────────────────────

import { API_BASE } from "../config";
export { API_BASE };

// ── Request helpers ─────────────────────────────────────────────

type RequestOptions = RequestInit;

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { ...fetchOptions } = options;

  const headers: HeadersInit = {
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(
      (error as { error?: string }).error || "Request failed",
    );
  }

  return response.json() as Promise<T>;
}

export async function authenticatedFetch<T>(
  path: string,
  options: RequestInit = {},
  getToken: () => Promise<string | null>,
): Promise<T> {
  const token = await getToken();
  const headers: HeadersInit = {
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(
      (error as { error?: string }).error || "Request failed",
    );
  }

  return response.json() as Promise<T>;
}

// ── Channel Types ───────────────────────────────────────────────

export type ChannelType = "finance" | "sports" | "fantasy" | "rss";

export interface Channel {
  id: number;
  channel_type: ChannelType;
  enabled: boolean;
  visible: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RssChannelConfig {
  feeds?: Array<{ name: string; url: string }>;
}

// ── Channels API ────────────────────────────────────────────────

export const channelsApi = {
  getAll: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<{ channels: Array<Channel> }>(
      "/users/me/channels",
      {},
      getToken,
    ),

  create: (
    channelType: ChannelType,
    config: Record<string, unknown>,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<Channel>(
      "/users/me/channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_type: channelType, config }),
      },
      getToken,
    ),

  update: (
    channelType: ChannelType,
    data: {
      enabled?: boolean;
      visible?: boolean;
      config?: Record<string, unknown>;
    },
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<Channel>(
      `/users/me/channels/${channelType}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
      getToken,
    ),

  delete: (
    channelType: ChannelType,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<{
      status: string;
      message: string;
    }>(`/users/me/channels/${channelType}`, { method: "DELETE" }, getToken),
};

// ── RSS Types & API ─────────────────────────────────────────────

export interface TrackedFeed {
  url: string;
  name: string;
  category: string;
  is_default: boolean;
}

export const rssApi = {
  /** Fetch the public feed catalog (no auth required) */
  getCatalog: () => request<Array<TrackedFeed>>("/rss/feeds"),

  /** Delete a custom (non-default) feed from the catalog */
  deleteFeed: (url: string, getToken: () => Promise<string | null>) =>
    authenticatedFetch<{ status: string; message: string }>(
      "/rss/feeds",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      },
      getToken,
    ),
};


