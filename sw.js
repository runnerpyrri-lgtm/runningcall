const CACHE_NAME = "outbom-v0.25.1";
const CACHE_PREFIX = "outbom-v";
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const APP_SHELL = [
  SCOPE_PATH,
  `${SCOPE_PATH}manifest.webmanifest`,
  `${SCOPE_PATH}icons/icon-192.png`,
  `${SCOPE_PATH}icons/icon-512.png`,
  `${SCOPE_PATH}icons/maskable-512.png`,
  `${SCOPE_PATH}bom-outbom.svg`
];

async function cacheAppShell(urls) {
  const cache = await caches.open(CACHE_NAME);
  const uniqueUrls = [...new Set(Array.isArray(urls) ? urls : [])];
  await Promise.allSettled(uniqueUrls.map(async (candidate) => {
    const url = new URL(candidate, self.location.origin);
    if (url.origin !== self.location.origin) return;
    if (!url.pathname.startsWith(SCOPE_PATH) || url.pathname.startsWith(`${SCOPE_PATH}api/`)) return;
    const response = await fetch(url.href, { cache: "reload" });
    if (response.ok && response.status === 200) await cache.put(url.href, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell(APP_SHELL));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
  if (event.data?.type === "CACHE_APP_SHELL") event.waitUntil(cacheAppShell(event.data.urls));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${SCOPE_PATH}api/`)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.status === 200) {
        // 캐시 저장 실패(quota 초과·206 부분응답 등)가 성공한 네트워크 응답까지 망치지 않게 한다.
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch {
          // 저장만 건너뛴다.
        }
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const shell = await caches.match(SCOPE_PATH);
        if (shell) return shell;
      }
      throw error;
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let targetUrl = self.registration.scope;
  try {
    const candidate = new URL(event.notification.data?.url || SCOPE_PATH, self.location.origin);
    if (candidate.origin === self.location.origin) targetUrl = candidate.href;
  } catch {
    // 잘못된 알림 주소는 앱 홈으로 보낸다.
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          if ("navigate" in client) await client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
