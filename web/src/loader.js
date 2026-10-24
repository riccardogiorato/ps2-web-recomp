export async function loadRuntime(module, { onProgress, onCache }) {
  const base = new URL('./', location.href);
  const response = await fetch(new URL('player-manifest.json', base), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Player build is missing. Run scripts/build_web.sh for this game.');
  const manifest = await response.json();
  module.runtimeVersion = manifest.runtimeVersion;
  module.gameId = manifest.gameId;
  module.startupDataBytes = manifest.sizes?.['ps2web.data?v=' + manifest.runtimeVersion];
  if (!manifest.runtime.includes('ps2web.wasm')) throw new Error('Build the game runtime before starting the player.');
  let networkOnly = false;
  module.locateFile = (path) => new URL(path + (path.includes('?') ? '&' : '?') + 'v=' + manifest.runtimeVersion + (networkOnly ? '&network=1' : ''), base).href;
  module.mainScriptUrlOrBlob = module.locateFile('ps2web.js');
  const progress = (event) => {
    if (event.data?.type === 'player-download' && event.data.build === manifest.build) {
      if (event.data.error) onCache('Cache unavailable: ' + event.data.error);
      else onProgress(event.data);
    }
  };
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    navigator.serviceWorker.addEventListener('message', progress);
    try {
      onProgress({ message: 'Checking downloaded player…' });
      const registration = await navigator.serviceWorker.register(new URL('sw.js?v=' + manifest.build, base), { scope: base.pathname, updateViaCache: 'none' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!worker || new URL(worker.scriptURL).searchParams.get('v') !== manifest.build) throw new Error('The new player cache could not be installed.');
      if (worker.state !== 'activated') await new Promise((resolve, reject) => {
        const check = () => {
          if (worker.state === 'activated') resolve();
          if (worker.state === 'redundant') reject(new Error('Player cache could not be installed. Check free storage and reload.'));
        };
        worker.addEventListener('statechange', check);
        check();
      });
      if (!navigator.serviceWorker.controller) await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      onCache('Player assets cached on this device. The game disc is streamed separately.');
    } catch (error) {
      // Storage restrictions must not prevent online play.
      networkOnly = true;
      console.warn('Player cache unavailable:', error);
      onCache('Cache unavailable. Player assets will load from the network.');
    } finally {
      navigator.serviceWorker.removeEventListener('message', progress);
    }
  } else onCache('Player assets load from the network in development or unsupported browsers.');
  module.mainScriptUrlOrBlob = module.locateFile('ps2web.js');
  onProgress({ message: 'Initializing WebAssembly and graphics…' });
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = module.mainScriptUrlOrBlob;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the player runtime. Check your connection and reload.'));
    document.body.append(script);
  });
}

export async function clearPlayerCache() {
  if (!('caches' in window)) return;
  const prefix = 'ps2-player-' + encodeURIComponent(new URL('./', location.href).pathname) + '-';
  for (const key of await caches.keys()) if (key.startsWith(prefix)) await caches.delete(key);
  if ('serviceWorker' in navigator) {
    const scope = new URL('./', location.href).href;
    for (const registration of await navigator.serviceWorker.getRegistrations()) if (registration.scope === scope) await registration.unregister();
  }
}
