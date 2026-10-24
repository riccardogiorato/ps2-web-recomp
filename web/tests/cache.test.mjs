import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { appendSample, sparkPoints } from '../src/telemetry.js';

function worker({ fail, offline = false, build = 'test', stores = new Map(), knownSizes = false } = {}) {
  const handlers = {}, messages = [], requests = [];
  const key = (request) => typeof request === 'string' ? request : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name);
      return { async put(request, response) { map.set(key(request), new Response(await response.arrayBuffer(), { headers: response.headers })); }, async match(request) { return map.get(key(request))?.clone(); } };
    },
    async match(request) { for (const store of stores.values()) if (store.has(key(request))) return store.get(key(request)).clone(); },
    async delete(name) { return stores.delete(name); },
  };
  const self = { location: { href: 'https://player.test/kh2/sw.js' }, clients: { async matchAll() { return [{ postMessage(message) { messages.push(message); } }]; }, async claim() {} }, async skipWaiting() {}, addEventListener(type, handler) { handlers[type] = handler; } };
  const manifest = { build, assets: ['index.html', 'assets/app.js', 'ps2web.wasm?v=test'] };
  if (knownSizes) manifest.sizes = Object.fromEntries(manifest.assets.map((path) => [path, new TextEncoder().encode('data:https://player.test/kh2/' + path).length]));
  const context = { self, caches, URL, Request, Response, Date, async fetch(request) {
    const url = key(request); requests.push(url);
    if (offline || url.includes(fail || 'never-fail')) throw new Error('Network unavailable');
    return new Response(url.endsWith('player-manifest.json') ? JSON.stringify(manifest) : 'data:' + url, { headers: { 'Cross-Origin-Embedder-Policy': 'require-corp' } });
  } };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8').replace('__PLAYER_BUILD__', build).replace('__RUNTIME_VERSION__', 'test'), context);
  const install = () => { let promise; handlers.install({ waitUntil(value) { promise = value; } }); return promise; };
  const request = (url, { navigation = false, ...options } = {}) => { let promise; const request = new Request(url, options); if (navigation) Object.defineProperty(request, 'mode', { value: 'navigate' }); handlers.fetch({ request, respondWith(value) { promise = value; } }); return promise; };
  return { install, request, caches, stores, messages, requests, setOffline() { offline = true; } };
}

test('installer caches a complete build, reports progress, and preserves isolation headers', async () => {
  const w = worker(); await w.install();
  const response = await w.request('https://player.test/kh2/ps2web.wasm?v=test');
  assert.equal(await response.text(), 'data:https://player.test/kh2/ps2web.wasm?v=test');
  assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
  assert.ok(w.messages.some((message) => message.done));
});

test('warm runtime requests do not download the binary again', async () => {
  const w = worker(); await w.install(); const count = w.requests.length;
  await w.request('https://player.test/kh2/ps2web.wasm?v=test');
  await w.request('https://player.test/kh2/ps2web.wasm?v=test');
  assert.equal(w.requests.length, count);
});

test('download messages report decoded byte totals, including files reused from cache', async () => {
  const first = worker({ knownSizes: true }); await first.install();
  const done = first.messages.find((message) => message.done);
  assert.ok(done.totalSize > 0);
  assert.equal(done.loadedBytes, done.totalSize);
  const next = worker({ build: 'new-ui', stores: first.stores, knownSizes: true }); await next.install();
  assert.ok(next.messages.some((message) => message.cached && message.bytes > 0));
  const finished = next.messages.find((message) => message.done);
  assert.equal(finished.loadedBytes, finished.totalSize);
});

test('disc ranges, save files, other origins, and T3 routes bypass the player cache', () => {
  const w = worker();
  for (const url of ['https://player.test/kh2/disc.iso', 'https://player.test/kh2/save.state', 'https://player.test/.well-known/t3/environment', 'https://elsewhere.test/kh2/assets/app.js']) assert.equal(w.request(url), undefined);
  assert.equal(w.request('https://player.test/kh2/ps2web.wasm?v=new&network=1'), undefined);
  assert.equal(w.request('https://player.test/kh2/assets/app.js', { headers: { Range: 'bytes=0-20' } }), undefined);
});

test('a missing old binary cannot silently resolve to the new build', async () => {
  const w = worker();
  const response = await w.request('https://player.test/kh2/ps2web.wasm?v=old');
  assert.equal(response.status, 409); assert.equal(w.requests.length, 0);
});

test('failed installation removes its incomplete cache', async () => {
  const w = worker({ fail: 'ps2web.wasm' });
  await assert.rejects(w.install()); assert.equal(w.stores.size, 0);
  assert.ok(w.messages.some((message) => message.error));
});

test('cached shell and manifest can be read offline', async () => {
  const w = worker(); await w.install(); w.setOffline();
  const shell = await w.request('https://player.test/kh2/', { navigation: true });
  assert.ok((await shell.text()).includes('index.html'));
  const manifest = await w.request('https://player.test/kh2/player-manifest.json');
  assert.equal((await manifest.json()).build, 'test');
  const script = await w.request('https://player.test/kh2/assets/app.js');
  assert.ok((await script.text()).startsWith('data:'));
});

test('telemetry keeps bounded real samples and never emits invalid graph coordinates', () => {
  let history = [];
  for (let i = 0; i < 100; i++) history = appendSample(history, i);
  assert.equal(history.length, 24); assert.equal(history[0], 76);
  assert.equal(appendSample(history, null), history);
  assert.equal(appendSample(history, NaN), history);
  assert.equal(sparkPoints([]), '');
  assert.ok(!/NaN|Infinity/.test(sparkPoints([0, 5, 300])));
});

test('UI updates reuse unchanged cached runtime binaries during installation', async () => {
  const first = worker(); await first.install();
  const next = worker({ build: 'next-ui', stores: first.stores }); await next.install();
  assert.equal(next.requests.filter((url) => url.includes('ps2web.wasm')).length, 0);
  assert.ok(next.requests.some((url) => url.includes('assets/app.js')));
});
