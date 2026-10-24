/* The build replaces this token; all caches stay inside this player's URL scope. */
const BUILD = '__PLAYER_BUILD__';
const RUNTIME = '__RUNTIME_VERSION__';
const base = new URL('./', self.location.href);
const PREFIX = 'ps2-player-' + encodeURIComponent(base.pathname) + '-';
const CACHE = PREFIX + BUILD;
const absolute = (path) => new URL(path, base).href;
const runtimeFile = (url) => /\/ps2web\.(js|wasm|data)$/.test(url.pathname);

async function progress(message) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage({ type: 'player-download', build: BUILD, ...message });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(absolute('player-manifest.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot load player manifest');
    const manifest = await response.json();
    if (manifest.build !== BUILD) throw new Error('Build changed during installation; reload the player');
    const cache = await caches.open(CACHE);
    const sizesKnown = manifest.assets.every((path) => Number.isFinite(manifest.sizes?.[path]));
    const totalSize = sizesKnown ? manifest.assets.reduce((sum, path) => sum + manifest.sizes[path], 0) : null;
    let completedBytes = 0;
    try {
      for (let index = 0; index < manifest.assets.length; index++) {
        const path = manifest.assets[index];
        const report = (bytes, extra = {}) => progress({ file: path.split('?')[0], index, count: manifest.assets.length, bytes, totalBytes: manifest.sizes?.[path], loadedBytes: sizesKnown ? completedBytes + bytes : bytes, totalSize, ...extra });
        await report(0);
        const saved = runtimeFile(new URL(absolute(path))) ? await caches.match(absolute(path)) : null;
        if (saved) {
          await cache.put(absolute(path), saved);
          await report(manifest.sizes?.[path] || 0, { cached: true });
          completedBytes += manifest.sizes?.[path] || 0;
          continue;
        }
        const asset = await fetch(absolute(path), { cache: 'no-store' });
        if (!asset.ok) throw new Error('Download failed: ' + path);
        // Report real bytes without turning the entire download into a JS array.
        const [stored, measured] = asset.body.tee();
        const write = cache.put(absolute(path), new Response(stored, { headers: asset.headers, status: asset.status }));
        const reader = measured.getReader();
        let bytes = 0, last = 0;
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (Date.now() - last > 150) {
            await report(bytes);
            last = Date.now();
          }
        }
        await write;
        await report(bytes);
        completedBytes += manifest.sizes?.[path] ?? bytes;
      }
      await cache.put(absolute('player-manifest.json'), new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
      await progress({ done: true, count: manifest.assets.length, index: manifest.assets.length, loadedBytes: completedBytes, totalSize });
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE);
      await progress({ error: error.message });
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  // Keep older versions for tabs still running their original Wasm and workers.
  // The settings action clears downloaded assets explicitly without touching saves.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  if (url.searchParams.get('network') === '1') return;
  if (event.request.headers.has('Range') || /\.(iso|state|ps2|bin)$/i.test(url.pathname)) return;
  if (runtimeFile(url) && url.searchParams.has('v')) {
    event.respondWith((async () => {
      const version = url.searchParams.get('v');
      const cached = await caches.match(event.request);
      if (cached) return cached;
      // Never replace a missing old runtime with a different build's binary.
      if (version !== RUNTIME) return new Response('Player updated. Reload to continue.', { status: 409 });
      return fetch(event.request);
    })());
    return;
  }
  const relative = url.pathname.slice(base.pathname.length);
  if (event.request.mode === 'navigate' || relative === 'player-manifest.json') {
    event.respondWith((async () => {
      try { const response = await fetch(event.request); if (response.ok) return response; } catch {}
      const cache = await caches.open(CACHE);
      return (await cache.match(absolute(relative === 'player-manifest.json' ? relative : 'index.html'))) || Response.error();
    })());
  } else if (relative.startsWith('assets/')) {
    event.respondWith((async () => (await caches.match(event.request)) || fetch(event.request))());
  }
});
