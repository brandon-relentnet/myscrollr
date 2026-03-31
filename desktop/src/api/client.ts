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

/** Parse error body and throw — shared by request() and authFetch(). */
async function handleResponse<T>(response: Response): Promise<T> {
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

/** Unauthenticated request — use for public endpoints. */
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...options.headers },
  });

  return handleResponse<T>(response);
}

/**
 * Authenticated request — resolves a valid token via getValidToken()
 * (handles silent refresh) and attaches it as a Bearer header.
 *
 * On 401, forces a token refresh and retries the request once.
 */
export async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getValidToken();
  const headers: HeadersInit = { ...options.headers };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  } else {
    console.warn("[authFetch] No valid token — request will be unauthenticated:", path);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // 401 retry: force a token refresh and retry the request once
  if (response.status === 401 && token) {
    const newToken = await getValidToken(true);
    if (newToken && newToken !== token) {
      const retryResponse = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
      });
      return handleResponse<T>(retryResponse);
    }
  }

  return handleResponse<T>(response);
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
  feeds?: Array<{ name: string; url: string; is_custom?: boolean }>;
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

// ── Channel visibility toggle ───────────────────────────────────

/**
 * Toggle a channel's visibility (and optionally mark it enabled).
 * Returns a promise that resolves when the API call completes.
 * Callers are responsible for invalidating queries afterward.
 */
export async function toggleChannelVisibility(
  channelType: ChannelType,
  visible: boolean,
  enabled?: boolean,
): Promise<void> {
  const payload: { visible: boolean; enabled?: boolean } = { visible };
  if (enabled !== undefined) payload.enabled = enabled;
  await channelsApi.update(channelType, payload);
}

// ── Subscription Types & API ────────────────────────────────────

export interface SubscriptionInfo {
  plan: string;
  status: "none" | "active" | "trialing" | "canceling" | "canceled" | "past_due";
  current_period_end?: string;
  lifetime: boolean;
  pending_downgrade_plan?: string;
  scheduled_change_at?: string;
  amount?: number;
  currency?: string;
  interval?: string;
  trial_end?: number;
  had_prior_sub: boolean;
}

export async function fetchSubscription(): Promise<SubscriptionInfo> {
  return authFetch<SubscriptionInfo>("/users/me/subscription");
}

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


