import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { LogtoProvider } from '@logto/react'
import type { LogtoConfig } from '@logto/react'
import { routeTree } from '@/routeTree.gen'

// Import the generated route tree

import '@/styles.css'

// Logto configuration
const logtoConfig: LogtoConfig = {
  endpoint: 'https://auth.myscrollr.relentnet.dev/',
  appId: 'ogbulfshvf934eeli4t9u',
  resources: ['https://api.myscrollr.relentnet.dev'],
}

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultResetScroll: true,
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
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <LogtoProvider config={logtoConfig}>
        <RouterProvider router={router} />
      </LogtoProvider>
    </StrictMode>,
  )
}
