/**
 * ════════════════════════════════════════════════════════════════════════════
 * SERVICE WORKER — Karaokê do Romas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Provides real offline capability by caching the app shell.
 * Audio files are stored in IndexedDB (not here).
 *
 * Strategy:
 *   - App shell (HTML, JS, CSS, fonts, images): Cache-First
 *   - Firebase API calls: Network-Only (skip cache)
 *   - Everything else: Network-First with cache fallback
 *
 * LOCAL_FIRST_V1.1
 * ════════════════════════════════════════════════════════════════════════════
 */

const CACHE_NAME = 'karaoke-romas-v1';
const OFFLINE_FALLBACK = '/offline.html';

// App shell resources to pre-cache on install
const APP_SHELL_URLS = [
  '/',
  '/add-music-screen',
  '/karaoke-player-screen',
  '/sync-storage',
  '/offline.html',
  '/favicon.ico',
  '/assets/images/app_logo.png',
  '/assets/images/no_image.png',
];

// URLs that should NEVER be cached (Firebase, external APIs)
const NEVER_CACHE_PATTERNS = [
  /firebasestorage\.googleapis\.com/,
  /firestore\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /googleapis\.com/,
];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell...');
      // Use addAll with individual error handling to avoid failing on missing files
      return Promise.allSettled(
        APP_SHELL_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to pre-cache ${url}:`, err.message);
          })
        )
      );
    }).then(() => {
      console.log('[SW] App shell cached. Skipping waiting...');
      return self.skipWaiting();
    })
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Service Worker activated. Claiming clients...');
      return self.clients.claim();
    })
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Skip Firebase and external API calls — always network only
  if (NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(request.url))) {
    return; // Let browser handle normally
  }

  // Skip Next.js HMR and webpack dev requests
  if (url.pathname.startsWith('/_next/webpack-hmr') ||
      url.pathname.startsWith('/__nextjs')) {
    return;
  }

  // Next.js static assets (_next/static) — Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Next.js image optimization — Network First
  if (url.pathname.startsWith('/_next/image')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // App pages and public assets — Network First with offline fallback
  event.respondWith(networkFirstWithFallback(request));
});

// ── Cache strategies ──────────────────────────────────────────────────────────

/**
 * Cache First: Return cached version if available, otherwise fetch and cache.
 * Best for static assets that rarely change.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network First: Try network, fall back to cache.
 * Best for pages that should be fresh but can work offline.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

/**
 * Network First with offline page fallback.
 * For navigation requests, returns offline.html when offline.
 */
async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      // Only cache same-origin responses
      if (new URL(request.url).origin === self.location.origin) {
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch {
    // Try cache first
    const cached = await caches.match(request);
    if (cached) return cached;

    // For navigation requests, return offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match(OFFLINE_FALLBACK);
      if (offlinePage) return offlinePage;
    }

    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
