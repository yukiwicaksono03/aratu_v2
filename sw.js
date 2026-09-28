const CACHE = 'aratu-studio-v5';
const SHELL = ['./', './index.html', './src/styles.css', './src/app.js', './src/core.js', './src/renderer.js', './src/storage.js', './src/icons.js', './src/panel-view.js', './manifest.webmanifest', './public/icon.svg', './public/icon-192.png', './public/icon-512.png', './public/assets/portrait.jpg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('aratu-studio-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && SHELL.some(file => new URL(file, self.registration.scope).href === event.request.url)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
