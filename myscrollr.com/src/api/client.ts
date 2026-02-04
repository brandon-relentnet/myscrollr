// API client for the Scrollr API

const API_BASE = import.meta.env.VITE_API_URL || ''

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { requiresAuth = false, ...fetchOptions } = options

  const headers: HeadersInit = {
    ...options.headers,
  }

  if (requiresAuth) {
    // Get access token from Logto
    const { getAccessToken } = await import('@logto/react')
    const token = await getAccessToken()
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

// Profile API
export const profileApi = {
  // Get public profile by username
  get: (username: string) => request<{
    username: string
    display_name?: string
    bio?: string
    is_public: boolean
    connected_yahoo: boolean
  }>(`/users/${username}`),

  // Get current user's full profile
  getMyProfile: () => request<{
    username: string
    display_name?: string
    bio?: string
    is_public: boolean
    connected_yahoo: boolean
    last_sync?: string
  }>('/users/me/profile', { requiresAuth: true }),

  // Update profile
  update: (data: {
    display_name?: string
    bio?: string
    is_public?: boolean
  }) => request('/users/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
    requiresAuth: true,
  }),

  // Set username (can only be done once)
  setUsername: (username: string) => request('/users/me/username', {
    method: 'POST',
    body: JSON.stringify({ username }),
    requiresAuth: true,
  }),

  // Disconnect Yahoo account
  disconnectYahoo: () => request('/users/me/disconnect/yahoo', {
    method: 'POST',
    requiresAuth: true,
  }),
}

// Dashboard API (for fetching user data)
export const dashboardApi = {
  get: () => request<{
    finance: Array<{
      symbol: string
      price: number
      previous_close: number
      price_change: number
      percentage_change: number
      direction: string
      last_updated: string
    }>
    sports: Array<{
      id: string
      league: string
      external_game_id: string
      link: string
      home_team_name: string
      home_team_logo: string
      home_team_score: number
      away_team_name: string
      away_team_logo: string
      away_team_score: number
      start_time: string
      short_detail: string
      state: string
    }>
    yahoo?: {
      // Yahoo fantasy content structure
      [key: string]: unknown
    }
  }>('/dashboard', { requiresAuth: true }),
}

// Yahoo API
export const yahooApi = {
  startOAuth: () => request<{ url: string }>('/yahoo/start', { requiresAuth: true }),
  getLeagues: () => request<unknown>('/yahoo/leagues', { requiresAuth: true }),
}
