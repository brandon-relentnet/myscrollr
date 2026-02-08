// API client for the Scrollr API

export const API_BASE = import.meta.env.VITE_API_URL || ''

// ── Shared Types ──────────────────────────────────────────────────

export interface UserPreferences {
  feed_mode: 'comfort' | 'compact'
  feed_position: 'top' | 'bottom'
  feed_behavior: 'overlay' | 'push'
  feed_enabled: boolean
  enabled_sites: string[]
  disabled_sites: string[]
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

// ── Stream Types ─────────────────────────────────────────────────

export type StreamType = 'finance' | 'sports' | 'fantasy' | 'rss'

export interface Stream {
  id: number
  stream_type: StreamType
  enabled: boolean
  visible: boolean
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RssStreamConfig {
  feeds?: Array<{ name: string; url: string }>
}

// ── Streams API ──────────────────────────────────────────────────

export const streamsApi = {
  getAll: (getToken: () => Promise<string | null>) =>
    authenticatedFetch<{ streams: Stream[] }>(
      '/users/me/streams',
      {},
      getToken,
    ),

  create: (
    streamType: StreamType,
    config: Record<string, unknown>,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<Stream>(
      '/users/me/streams',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_type: streamType, config }),
      },
      getToken,
    ),

  update: (
    streamType: StreamType,
    data: { enabled?: boolean; visible?: boolean; config?: Record<string, unknown> },
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<Stream>(
      `/users/me/streams/${streamType}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      getToken,
    ),

  delete: (
    streamType: StreamType,
    getToken: () => Promise<string | null>,
  ) =>
    authenticatedFetch<{ status: string; message: string }>(
      `/users/me/streams/${streamType}`,
      { method: 'DELETE' },
      getToken,
    ),
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
  getCatalog: () => request<TrackedFeed[]>('/rss/feeds'),

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

export async function updatePreferences(
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
