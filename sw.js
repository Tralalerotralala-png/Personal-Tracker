// Service worker: makes the app open instantly and work offline.
//  - App files are served from the cache and refreshed in the background.
//  - Fonts and the Supabase script (CDN) are cached the same way.
//  - Requests to Supabase itself are never touched (sync handles those).
// Bump VERSION whenever you deploy, so installed copies notice the update.
const VERSION = 'v29';
const SHELL = `tracker-shell-${VERSION}`;
const RUNTIME = `tracker-runtime-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/ui/language.js',
  './js/photos.js',
  './js/game-backups.js',
  './js/ui/game-backup-panel.js',
  './js/weather/environment.js',
  './js/calendar/ics.js',
  './js/calendar/recurrence.js',
  './js/data/adapters.js',
  './js/data/app-data.js',
  './js/data/backup.js',
  './js/data/defaults.js',
  './js/data/inventory-logic.js',
  './js/data/sample-data.js',
  './js/data/schema.js',
  './js/data/store.js',
  './js/data/tracking.js',
  './js/data/supabase.js',
  './js/data/sync.js',
  './js/data/util.js',
  './js/feed/parse.js',
  './js/feed/service.js',
  './js/feed/sources.js',
  './js/ui/calendar.js',
  './js/ui/dom.js',
  './js/ui/feed.js',
  './js/ui/format.js',
  './js/ui/inventory.js',
  './js/ui/layout-editor.js',
  './js/ui/login.js',
  './js/ui/mud-format-v2.js',
  './js/ui/mud-settings.js',
  './js/ui/mud.js',
  './js/ui/overview.js',
  './js/ui/dream-diary.js', './js/ui/games.js',
  './js/ui/private-journal-crypto.js',
  './js/ui/daily-phrases.js',
  './js/ui/media-library.js',
  './js/weather/sky-events.js',
  './js/ui/personal-hub.js',
  './js/ui/expenses.js',
  './js/ui/pixel-icon.js',
  './js/ui/place-search.js',
  './js/ui/places.js',
  './js/ui/settings.js',
  './js/ui/wallpaper-settings.js',
  './js/wallpaper/config.js',
  './js/wallpaper/main.js',
  './js/wallpaper/snapshot.js',
  './js/wallpaper/store.js',
  './js/weather/mud.js',
  './js/weather/moon-phase.js',
  './icons/inventory/methotrexate-16.png',
  './js/weather/open-meteo.js',
  './js/weather/service.js',
  './js/widgets/currency.js',
  './js/widgets/defs.js',
  './js/widgets/layout.js',
  './js/widgets/registry.js',
  './js/widgets/store.js',
];
// Not required to exist (local-only mode has no config.js).
const OPTIONAL = ['./config.js'];

const CDN_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net']);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(PRECACHE.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch((err) => console.warn('precache failed:', url, err))));
    await Promise.all(OPTIONAL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHELL && key !== RUNTIME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.has(url.hostname)) return; // Supabase and everything else: untouched
  const critical = sameOrigin && (req.mode === 'navigate' || /\.(?:m?js|css|html)$/.test(url.pathname));
  event.respondWith(critical ? networkFirst(event, req) : staleWhileRevalidate(event, req, sameOrigin));
});

async function staleWhileRevalidate(event, req, sameOrigin) {
  const cache = await caches.open(sameOrigin ? SHELL : RUNTIME);
  const cached = await cache.match(req, { ignoreSearch: sameOrigin });

  const refresh = fetch(req, sameOrigin ? { cache: 'no-cache' } : undefined)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const res = await refresh;
  if (res) return res;
  if (req.mode === 'navigate') {
    const shell = await cache.match('./index.html');
    if (shell) return shell;
  }
  return Response.error();
}

// Avoid mixing older cached JavaScript modules with a newly deployed app.
// Fallback to the matching cached file when genuinely offline.
async function networkFirst(event, req) {
  const cache=await caches.open(SHELL);
  try {
    const response=await fetch(req,{cache:'no-cache'});
    if(response?.ok){event.waitUntil(cache.put(req,response.clone()));return response;}
  } catch {}
  const cached=await cache.match(req,{ignoreSearch:true});
  if(cached)return cached;
  if(req.mode==='navigate')return await cache.match('./index.html')||Response.error();
  return Response.error();
}

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=event.notification.data?.target==='#calendar'?'#calendar':'#hub';
    const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clientsList){
      if(client.url.startsWith(self.registration.scope)){
        await client.focus();client.postMessage({type:'open-reminder-tab',target});return;
      }
    }
    await self.clients.openWindow(new URL('./'+target,self.registration.scope).href);
  })());
});
