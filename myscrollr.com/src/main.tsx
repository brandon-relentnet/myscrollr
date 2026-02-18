import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { LogtoProvider } from '@logto/react'
import type { LogtoConfig } from '@logto/react'
import { ScrollrAuthProvider } from '@/hooks/useScrollrAuth'
import { routeTree } from '@/routeTree.gen'

// Import the generated route tree

import '@/styles.css'

// Logto configuration — values come from VITE_ env vars (see .env.example)
const logtoConfig: LogtoConfig = {
  endpoint:
    import.meta.env.VITE_LOGTO_ENDPOINT ||
    'https://auth.myscrollr.relentnet.dev/',
  appId: import.meta.env.VITE_LOGTO_APP_ID || 'ogbulfshvf934eeli4t9u',
  resources: [
    import.meta.env.VITE_LOGTO_RESOURCE ||
      'https://api.myscrollr.relentnet.dev',
  ],
}

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('app')
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <LogtoProvider config={logtoConfig}>
        <ScrollrAuthProvider>
          <RouterProvider router={router} />
        </ScrollrAuthProvider>
      </LogtoProvider>
    </StrictMode>,
  )
}
