/**
 * Desktop API client — uses `fetch` from `@tauri-apps/plugin-http`
 * to bypass browser CORS (Rust reqwest under the hood).
 *
 * Two request helpers:
 *   - `request<T>()` — unauthenticated (public endpoints)
 *   - `authFetch<T>()` — automatically attaches Bearer token via getValidToken()
 */
import { fetch } from "@tauri-apps/plugin-http";
import { getValidToken } from "../auth";

// ── Constants ────────────────────────────────────────────────────

import { API_BASE } from "../config";
export { API_BASE };

// ── Request helpers ─────────────────────────────────────────────

/** Unauthenticated request — use for public endpoints. */
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...options.headers },
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

/**
 * Authenticated request — resolves a valid token via getValidToken()
 * (handles silent refresh) and attaches it as a Bearer header.
 */
export async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getValidToken();
  const headers: HeadersInit = { ...options.headers };

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
  getAll: () =>
    authFetch<{ channels: Array<Channel> }>("/users/me/channels"),

  create: (channelType: ChannelType, config: Record<string, unknown> = {}) =>
    authFetch<Channel>("/users/me/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_type: channelType, config }),
    }),

  update: (
    channelType: ChannelType,
    data: {
      enabled?: boolean;
      visible?: boolean;
      config?: Record<string, unknown>;
    },
  ) =>
    authFetch<Channel>(`/users/me/channels/${channelType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: (channelType: ChannelType) =>
    authFetch<{ status: string; message: string }>(
      `/users/me/channels/${channelType}`,
      { method: "DELETE" },
    ),
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
  deleteFeed: (url: string) =>
    authFetch<{ status: string; message: string }>("/rss/feeds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
};


