import { useCallback, useEffect, useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function getResolvedTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function getStoredPreference(): Theme | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return null
}

function applyTheme(theme: Theme) {
  const root = document.documentElement

  // Add transition class for smooth theme switching
  root.classList.add('theme-transition')

  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // Update theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#141420' : '#ffffff')
  }

  // Remove transition class after animation completes
  setTimeout(() => {
    root.classList.remove('theme-transition')
  }, 350)
}

// External store for theme state (avoids re-render issues)
let listeners: Array<() => void> = []

function subscribe(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getResolvedTheme, () => 'dark')

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(STORAGE_KEY, newTheme)
    applyTheme(newTheme)
    emitChange()
  }, [])

  const toggleTheme = useCallback(() => {
    const current = getResolvedTheme()
    setTheme(current === 'dark' ? 'light' : 'dark')
  }, [setTheme])

  // Listen for system preference changes (only when no explicit preference stored)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    function handleChange() {
      // Only follow system preference if user hasn't explicitly chosen
      if (!getStoredPreference()) {
        applyTheme(mq.matches ? 'dark' : 'light')
        emitChange()
      }
    }

    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  return { theme, setTheme, toggleTheme } as const
}
