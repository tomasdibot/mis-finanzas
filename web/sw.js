// Service worker: the app shell loads instantly and works offline (showing the last data it saw).
// Data always comes fresh from the Worker (/api/*) when there is a connection; those calls are never cached here.
const VERSION = "mf-v7";
const SHELL = ["./", "index.html", "styles.css", "app.js", "rules.js", "lib/api.js", "lib/session.js", "lib/store.js", "lib/sync.js", "lib/lock.js", "lib/normalize.js", "lib/crypto.js", "lib/personal.js", "lib/model.js", "privacidad.html", "lib/charts.js",
  "lib/icons.js", "lib/brands.js", "lib/breakdown.js", "lib/demo.js", "manifest.webmanifest", "icons/app-icon-192.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys()
  .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || (url.origin === location.origin && url.pathname.startsWith("/api/"))) return; // data: always live
  // App files: network first (so a new upload shows right away), but if the network takes longer than ~1 s the
  // saved copy is used, so opening the app never waits on a slow connection (the network answer still refreshes
  // the saved copy for next time). Fonts from Google's CDN: cache first.
  const cdn = /fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  const save = (r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; };
  if (cdn) { e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(save))); return; }
  if (url.origin !== location.origin) return;
  const net = fetch(e.request).then(save);
  e.respondWith(new Promise((resolve) => {
    let done = false; const give = (r) => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => caches.match(e.request).then((hit) => give(hit)), 1000);
    net.then((r) => { clearTimeout(timer); give(r); })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("index.html")).then(give));
  }));
});
