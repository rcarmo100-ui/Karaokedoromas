'use client';

import { useEffect } from 'react';

/**
 * Registers the Service Worker for PWA offline support.
 * Must be a client component — rendered inside layout.tsx.
 *
 * Browser support notes:
 * - Chrome/Edge/Firefox: Full support
 * - Safari 16.4+: Full support (including iOS)
 * - Safari < 16.4: Service Workers work but push notifications limited
 * - Private/Incognito mode: Service Workers may be disabled in some browsers
 *
 * LOCAL_FIRST_V1.1
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) {
      console.log('[SW] Service Workers not supported in this browser.');
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker?.register('/sw.js', {
          scope: '/',
        });
        console.log('[SW] Service Worker registered. Scope:', registration?.scope);

        registration?.addEventListener('updatefound', () => {
          const newWorker = registration?.installing;
          if (newWorker) {
            newWorker?.addEventListener('statechange', () => {
              if (newWorker?.state === 'installed' && navigator.serviceWorker?.controller) {
                console.log('[SW] New Service Worker installed. Refresh to update.');
              }
            });
          }
        });
      } catch (err) {
        console.warn('[SW] Service Worker registration failed:', err);
      }
    };

    // Register after page load to not block initial render
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
