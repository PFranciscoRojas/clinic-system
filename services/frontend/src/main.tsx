import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { App } from './App';
import { markUpdatePending, reloadNow } from '@/lib/swUpdate';
import './styles/global.css';

// A new deploy activates a new service worker, which fires 'controllerchange'.
// Reloading immediately would silently wipe whatever a professional is mid-typing
// in a clinical note (anything not yet flushed to localStorage). Reload right
// away only when nobody's looking at the tab; otherwise defer to a dismissible
// banner (see AppShell) so the reload happens on the user's own terms.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (document.visibilityState === 'hidden') reloadNow();
    else markUpdatePending();
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
