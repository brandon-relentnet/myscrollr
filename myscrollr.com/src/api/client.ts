// API client for the Scrollr API

const API_BASE = import.meta.env.VITE_API_URL || ''

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean
}

// Get access token - call this from a component that uses useLogto
export async function getAccessToken(): Promise<string | null> {
  try {
    const { useLogto } = await import('@logto/react')
    // useLogto is a hook, can't call it outside component
    // This function should only be called from within a React component
    return null
  } catch {
    return null
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
}

// Authenticated API caller - use this inside components with useLogto
export async function authenticatedFetch<T>(
  path: string,
  options: RequestInit = {},
  getToken: () => Promise<string | null>
): Promise<T> {
  const token = await getToken()
  const headers: HeadersInit = {
    ...options.headers,
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}
