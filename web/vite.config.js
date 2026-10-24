import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Version the whole player: UI and game-specific Wasm must belong to one build.
function playerManifest() {
  let outDir, ui = [];
  return {
    name: 'player-manifest',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    writeBundle(_options, bundle) { ui = Object.keys(bundle); },
    closeBundle() {
      const runtime = ['ps2web.js', 'ps2web.wasm', 'ps2web.data'].filter((file) => existsSync(resolve(outDir, file)));
      const runtimeHash = createHash('sha256');
      for (const file of runtime) runtimeHash.update(file).update(readFileSync(resolve(outDir, file)));
      const runtimeVersion = runtimeHash.digest('hex').slice(0, 20);
      const hash = createHash('sha256');
      for (const file of [...ui, ...runtime].sort()) hash.update(file).update(readFileSync(resolve(outDir, file)));
      // Include worker changes so a cache-policy fix also creates a new version.
      hash.update(readFileSync(resolve(outDir, 'sw.js')));
      const build = hash.digest('hex').slice(0, 20);
      const assets = [...ui, ...runtime.map((file) => file + '?v=' + runtimeVersion)];
      const sizes = Object.fromEntries(assets.map((file) => [file, readFileSync(resolve(outDir, file.split('?')[0])).byteLength]));
      // The preloaded game data stays identical across display-shader updates.
      const gameId = runtime.includes('ps2web.data') ? createHash('sha256').update(readFileSync(resolve(outDir, 'ps2web.data'))).digest('hex') : null;
      writeFileSync(resolve(outDir, 'player-manifest.json'), JSON.stringify({ build, runtimeVersion, gameId, assets, sizes, runtime }));
      const worker = readFileSync(resolve(outDir, 'sw.js'), 'utf8');
      writeFileSync(resolve(outDir, 'sw.js'), worker.replace('__PLAYER_BUILD__', build).replace('__RUNTIME_VERSION__', runtimeVersion));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), playerManifest()],
  build: { outDir: '../build/web-kh2', emptyOutDir: false },
  server: {
    port: 8621,
    strictPort: true,
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
    proxy: { '/ps2web': 'http://127.0.0.1:8620', '/disc.iso': 'http://127.0.0.1:8620', '/player-manifest.json': 'http://127.0.0.1:8620' },
  },
});
