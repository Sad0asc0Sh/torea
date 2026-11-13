/**
 * ============================================================================
 * Service Worker - Smart Caching Strategy
 * ============================================================================
 * Stale-While-Revalidate: Fast load from cache + background update
 */

const CACHE_VERSION = 'v2';
const CACHE_STATIC = `toinfinity-static-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `toinfinity-dynamic-${CACHE_VERSION}`;

// Static assets that are always cached
const STATIC_ASSETS = [
  '/css/app.css',
  '/css/shared/theme.css',
  '/js/mobile-ui.js',
  '/js/mobile-interactions.js',
  '/js/pwa-install.js',
  '/js/ti-enhance.js',
  '/icons/logo.png',
  '/icons/icon_192.png',
  '/icons/icon_512.png',
  '/manifest.json'
];

// Install: Cache static assets only
self.addEventListener('install', (e) => {
  console.log('[SW] Installing service worker');
  e.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.error('[SW] Cache addAll error:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (e) => {
  console.log('[SW] Activating service worker');
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Smart caching strategies
self.addEventListener('fetch', (e) => {
  // Skip non-GET requests
  if (e.request.method !== 'GET') return;
  
  // Skip chrome extensions
  if (e.request.url.startsWith('chrome-extension://')) return;
  
  const url = new URL(e.request.url);
  
  // Strategy 1: HTML pages - Stale While Revalidate
  // Serve from cache immediately, update in background
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      caches.open(CACHE_DYNAMIC).then(cache => {
        return cache.match(e.request).then(cachedResponse => {
          const fetchPromise = fetch(e.request).then(networkResponse => {
            // Update cache in background
            if (networkResponse && networkResponse.status === 200) {
              cache.put(e.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(err => {
            console.log('[SW] Network failed for HTML, using cache');
            return cachedResponse;
          });
          
          // Return cached version immediately, update in background
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }
  
  // Strategy 2: Static assets (CSS/JS) - Cache First with background refresh
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.startsWith(asset))) {
    e.respondWith(
      caches.match(e.request).then(response => {
        if (response) {
          // Serve from cache immediately
          return response;
        }
        
        // Not in cache, fetch from network
        return fetch(e.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_STATIC).then(cache => {
              cache.put(e.request, networkResponse.clone());
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }
  
  // Strategy 3: API calls - Network First with cache fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_DYNAMIC).then(cache => {
              cache.put(e.request, networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => {
          console.log('[SW] API call failed, trying cache');
          return caches.match(e.request);
        })
    );
    return;
  }
  
  // Strategy 4: Everything else - Network First
  e.respondWith(
    fetch(e.request)
      .then(response => response)
      .catch(() => {
        return caches.match(e.request).then(cachedResponse => {
          return cachedResponse || new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
