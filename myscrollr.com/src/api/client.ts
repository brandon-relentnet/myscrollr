// API client for the Scrollr API

export const API_BASE = import.meta.env.VITE_API_URL || ''

// ── Shared Types ──────────────────────────────────────────────────

export interface UserPreferences {
  feed_mode: 'comfort' | 'compact'
  feed_position: 'top' | 'bottom'
  feed_behavior: 'overlay' | 'push'
  feed_enabled: boolean
  enabled_sites: Array<string>
  disabled_sites: Array<string>
  subscription_tier: 'free' | 'uplink' | 'uplink_pro' | 'uplink_ultimate'
  updated_at: string
}

type RequestOptions = RequestInit

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { ...fetchOptions } = options

  const headers: HeadersInit = {
    ...options.headers,
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

// Authenticated API caller - use this inside components with useLogto
export async function authenticatedFetch<T>(
  path: string,
  options: RequestInit = {},
  getToken: () => Promise<string | null>,
): Promise<T> {
  const token = await getToken()
  const headers: HeadersInit = {
    ...options.headers,
  }

  if (token) {
    ;(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

// ── Channel Types ────────────────────────────────────────────────

export type ChannelType = 'finance' | 'sports' | 'fantasy' | 'rss'

export interface Channel {
  id: number
  channel_type: ChannelType
  enabled: boolean
  visible: boolean
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RssChannelConfig {
  feeds?: Array<{ name: string; url: string }>
}

// ── Channels API ─────────────────────────────────────────────────

export const channelsApi = {
  getAll: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<{ channels: Array<Channel> }>(
      '/users/me/channels',
      {},
      getToken,
    ),

  create: (
    channelType: ChannelType,
    config: Record<string, unknown>,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<Channel>(
      '/users/me/channels',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_type: channelType, config }),
      },
      getToken,
    ),

  update: (
    channelType: ChannelType,
    data: {
      enabled?: boolean
      visible?: boolean
      config?: Record<string, unknown>
    },
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<Channel>(
      `/users/me/channels/${channelType}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      getToken,
    ),

  delete: (channelType: ChannelType, getToken: () => Promise<string | null>) =>
    authenticatedFetch<{
      status: string
      message: string
    }>(`/users/me/channels/${channelType}`, { method: 'DELETE' }, getToken),
}

// ── RSS Types & API ──────────────────────────────────────────────

export interface TrackedFeed {
  url: string
  name: string
  category: string
  is_default: boolean
}

export const rssApi = {
  /** Fetch the public feed catalog (no auth required) */
  getCatalog: () => request<Array<TrackedFeed>>('/rss/feeds'),

  /** Delete a custom (non-default) feed from the catalog */
  deleteFeed: (url: string, getToken: () => Promise<string | null>) =>
    authenticatedFetch<{ status: string; message: string }>(
      '/rss/feeds',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      },
      getToken,
    ),
}

// ── Preferences API ───────────────────────────────────────────────

export async function getPreferences(
  getToken: () => Promise<string | null>,
): Promise<UserPreferences> {
  return authenticatedFetch<UserPreferences>(
    '/users/me/preferences',
    {},
    getToken,
  )
}

export function updatePreferences(
  prefs: Partial<UserPreferences>,
  getToken: () => Promise<string | null>,
): Promise<UserPreferences> {
  return authenticatedFetch<UserPreferences>(
    '/users/me/preferences',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    },
    getToken,
  )
}

// ── Billing Types & API ────────────────────────────────────────────

export interface CheckoutResponse {
  client_secret: string
  session_id: string
  publishable_key: string
}

export interface SubscriptionStatus {
  plan:
    | 'free'
    | 'monthly'
    | 'annual'
    | 'lifetime'
    | 'pro_monthly'
    | 'pro_annual'
    | 'ultimate_monthly'
    | 'ultimate_annual'
  status: 'none' | 'active' | 'canceling' | 'canceled' | 'past_due'
  current_period_end?: string
  lifetime: boolean
}

export interface CheckoutReturnStatus {
  status: string
  session_id?: string
}

export const billingApi = {
  /** Create a subscription checkout session (monthly/quarterly/annual) */
  createCheckoutSession: (
    priceId: string,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<CheckoutResponse>(
      '/checkout/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId }),
      },
      getToken,
    ),

  /** Create a lifetime checkout session */
  createLifetimeCheckout: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<CheckoutResponse>(
      '/checkout/lifetime',
      { method: 'POST' },
      getToken,
    ),

  /** Get checkout session return status */
  getCheckoutReturn: (
    sessionId: string,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<CheckoutReturnStatus>(
      `/checkout/return?session_id=${sessionId}`,
      {},
      getToken,
    ),

  /** Get current subscription status */
  getSubscription: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<SubscriptionStatus>(
      '/users/me/subscription',
      {},
      getToken,
    ),

  /** Cancel subscription at period end */
  cancelSubscription: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<{
      status: string
      current_period_end: string
      message: string
    }>('/users/me/subscription/cancel', { method: 'POST' }, getToken),
}
