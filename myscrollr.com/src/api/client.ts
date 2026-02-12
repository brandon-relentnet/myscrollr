// API client for the Scrollr API

export const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Dispatches a CustomEvent on the document to notify the Scrollr extension's
 * content script that config has changed. The content script listens for this
 * on myscrollr.com pages and sends FORCE_REFRESH to the background, which
 * immediately re-fetches dashboard data — giving free-tier users instant
 * config sync without needing SSE/CDC.
 */
function notifyExtensionConfigChanged(): void {
  try {
    document.dispatchEvent(new CustomEvent('scrollr:config-changed'))
  } catch {
    // Extension not installed or content script not loaded — ignore
  }
}

// ── Shared Types ──────────────────────────────────────────────────

export interface UserPreferences {
  feed_mode: 'comfort' | 'compact'
  feed_position: 'top' | 'bottom'
  feed_behavior: 'overlay' | 'push'
  feed_enabled: boolean
  enabled_sites: Array<string>
  disabled_sites: Array<string>
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
    authenticatedFetch<{ streams: Array<Stream> }>(
      '/users/me/streams',
      {},
      getToken,
    ),

  create: async (
    streamType: StreamType,
    config: Record<string, unknown>,
    getToken: () => Promise<string | null>,
  ) => {
    const result = await authenticatedFetch<Stream>(
      '/users/me/streams',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_type: streamType, config }),
      },
      getToken,
    )
    notifyExtensionConfigChanged()
    return result
  },

  update: async (
    streamType: StreamType,
    data: {
      enabled?: boolean
      visible?: boolean
      config?: Record<string, unknown>
    },
    getToken: () => Promise<string | null>,
  ) => {
    const result = await authenticatedFetch<Stream>(
      `/users/me/streams/${streamType}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      getToken,
    )
    notifyExtensionConfigChanged()
    return result
  },

  delete: async (streamType: StreamType, getToken: () => Promise<string | null>) => {
    const result = await authenticatedFetch<{ status: string; message: string }>(
      `/users/me/streams/${streamType}`,
      { method: 'DELETE' },
      getToken,
    )
    notifyExtensionConfigChanged()
    return result
  },
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

export async function updatePreferences(
  prefs: Partial<UserPreferences>,
  getToken: () => Promise<string | null>,
): Promise<UserPreferences> {
  const result = await authenticatedFetch<UserPreferences>(
    '/users/me/preferences',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    },
    getToken,
  )
  notifyExtensionConfigChanged()
  return result
}
