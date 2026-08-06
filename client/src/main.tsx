import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { IS_DEMO } from './lib/apiFetch'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
})

// Demo builds are plain static files with no server in front of them, so a deep link like
// /match/123 would 404 on GitHub Pages and cannot resolve at all from file://. HashRouter
// keeps routing entirely client-side. The normal build is unaffected and still uses real paths.
const Router = IS_DEMO ? HashRouter : BrowserRouter

// Guarded by the compile-time IS_DEMO constant so the bundler drops this import — and with it
// the whole snapshot — from a production build.
const DemoLayer = IS_DEMO ? lazy(() => import('./demo/DemoLayer')) : null

// Provider order: QueryClientProvider outer, BrowserRouter inner.
// This allows router-level prefetching in future phases without restructuring.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {DemoLayer && (
        <Suspense fallback={null}>
          <DemoLayer />
        </Suspense>
      )}
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </StrictMode>,
)
