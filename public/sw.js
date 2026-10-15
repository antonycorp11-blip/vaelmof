/* Vaelmor — service worker: cache offline.
 * No build (`npm run build`) o plugin em vite.config.ts substitui a lista
 * abaixo pelo essencial para abrir (página, código, fontes, ícones) e grava
 * uma versão nova, invalidando o cache antigo. As imagens e dados entram no
 * cache na primeira vez que o jogo os pede. */
const VERSION = 'dev';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const CACHE = `vaelmor-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: 'reload' ignora o cache HTTP da CDN e baixa a versão nova de verdade
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vaelmor-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// páginas: rede primeiro (pega o index.html novo); demais arquivos: cache primeiro
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // rede primeiro (pega a versão nova), mas sem deixar a abertura presa: com a
    // rede lenta, em 3 s abre a cópia guardada (a nova fica para a próxima vez)
    const net = fetch(req, { cache: 'no-store' }).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
      }
      return res;
    });
    const slow = new Promise((resolve) => setTimeout(resolve, 3000)).then(() => caches.match('./index.html')).then((hit) => hit || net);
    event.respondWith(Promise.race([net.catch(() => caches.match('./index.html')), slow]));
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      // revalida com o servidor (304 barato) para não guardar uma imagem velha da CDN
      return fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
