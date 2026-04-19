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

// ── Tier Limits ──────────────────────────────────────────────────
//
// Source of truth lives in api/core/tier_limits.go (DefaultTierLimits).
// Null means "unlimited" for that cap.

export type TierKey =
  | 'free'
  | 'uplink'
  | 'uplink_pro'
  | 'uplink_ultimate'
  | 'super_user'

export interface ChannelLimits {
  symbols: number | null
  feeds: number | null
  custom_feeds: number | null
  leagues: number | null
  fantasy: number | null
}

export interface TierLimitsResponse {
  tiers: Record<TierKey, ChannelLimits>
}

export const tierLimitsApi = {
  /** Fetch tier limits from the backend. Cached by the CDN for 5 min. */
  get: () => request<TierLimitsResponse>('/tier-limits'),
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
  status: 'none' | 'active' | 'trialing' | 'canceling' | 'canceled' | 'past_due'
  current_period_end?: string
  lifetime: boolean
  pending_downgrade_plan?: string
  scheduled_change_at?: string
  amount?: number
  currency?: string
  interval?: string
  trial_end?: number
  had_prior_sub: boolean
}

export interface CheckoutReturnStatus {
  status: string
  session_id?: string
}

export interface SetupIntentResponse {
  client_secret: string
  plan: string
  has_trial: boolean
  trial_days: number
  amount: number
  currency: string
  interval: string
  publishable_key: string
}

export interface SubscribeResponse {
  subscription_id: string
  status: string
  trial_end?: number
  plan: string
}

export interface PaymentIntentResponse {
  client_secret: string
  amount: number
  currency: string
  publishable_key: string
}

export const billingApi = {
  /** Create a subscription checkout session (monthly/annual) */
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

  /** Create a SetupIntent for subscription checkout (PaymentElement flow) */
  createSetupIntent: (
    priceId: string,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<SetupIntentResponse>(
      '/checkout/setup-intent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId }),
      },
      getToken,
    ),

  /** Confirm subscription after SetupIntent is confirmed */
  confirmSubscription: (
    setupIntentId: string,
    priceId: string,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<SubscribeResponse>(
      '/checkout/subscribe',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setup_intent_id: setupIntentId,
          price_id: priceId,
        }),
      },
      getToken,
    ),

  /** Create a PaymentIntent for lifetime purchase (PaymentElement flow) */
  createPaymentIntent: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<PaymentIntentResponse>(
      '/checkout/payment-intent',
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

  /** Preview the proration cost of a plan change */
  previewPlanChange: (
    priceId: string,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<{
      amount_due: number
      currency: string
      proration_date: number
      is_downgrade: boolean
      scheduled_date: number
      is_trial_change?: boolean
      trial_end?: number
    }>(
      `/users/me/subscription/preview?price_id=${encodeURIComponent(priceId)}`,
      {},
      getToken,
    ),

  /** Change subscription plan (upgrade/downgrade with proration) */
  changePlan: (
    priceId: string,
    prorationDate: number,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<SubscriptionStatus>(
      '/users/me/subscription/plan',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_id: priceId,
          proration_date: prorationDate,
        }),
      },
      getToken,
    ),

  /** Cancel subscription at period end */
  cancelSubscription: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<{
      status: string
      current_period_end: string
      message: string
    }>('/users/me/subscription/cancel', { method: 'POST' }, getToken),

  /** Create a Stripe Customer Portal session */
  createPortalSession: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<{ url: string }>(
      '/users/me/subscription/portal',
      { method: 'POST' },
      getToken,
    ),
}

// ── Invite API ───────────────────────────────────────────────────

export interface CompleteInviteRequest {
  email: string
  token: string
  password: string
  birthday: string
  gender: string
  username: string
  first_name: string
  last_name: string
}

export interface CompleteInviteResponse {
  success: boolean
  username: string
}

export interface CheckUsernameResponse {
  available: boolean
  reason?: 'invalid' | 'taken'
}

export const inviteApi = {
  completeInvite: (data: CompleteInviteRequest) =>
    request<CompleteInviteResponse>('/invite/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  checkUsernameAvailable: (email: string, username: string) =>
    request<CheckUsernameResponse>(
      `/invite/username-available?email=${encodeURIComponent(email)}&username=${encodeURIComponent(username)}`,
    ),
}
