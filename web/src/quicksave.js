const STATE_FILE = '/quicksave.state';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ps2-player-quicksave', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('slots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other player tabs and try again.'));
  });
}

// A put commits atomically: a failed write preserves the previous quick save.
export async function slotTransaction(key, value) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('slots', value === undefined ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('slots');
      const request = value === undefined ? store.get(key) : store.put(value, key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error('Browser storage write failed.'));
      transaction.onerror = () => {}; // onabort reports the final transaction result.
    });
  } finally { db.close(); }
}

async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createQuickSave({ module, fileSystem, onChange, storage = slotTransaction, hash = digest, base = location.href }) {
  const key = new URL('./', base).pathname + '|' + new URL(module.discUrl, base).href;
  let busy = false, pending = null;
  let status = { available: false, exists: false, compatible: false, busy: false, message: 'Checking quick save…' };
  const publish = (next) => { status = { ...status, ...next }; onChange(status); };
  // Legacy slots predate gameId and already belong to this game's URL key.
  // The engine validates the state format; shader/build hashes are not a
  // save-state format and must not invalidate a player's progress.
  const compatible = (record) => !!record && (!record.gameId || record.gameId === module.gameId);
  const savedMessage = (record) => 'Saved ' + new Date(record.savedAt).toLocaleString();
  const cleanup = () => { try { fileSystem().unlink(STATE_FILE); } catch {} };

  module.onQuickState = (loading, success) => {
    if (!pending || pending.loading !== loading) return;
    const { resolve, reject } = pending;
    pending = null;
    if (success) resolve();
    else reject(new Error(loading ? 'Quick load failed. Reload the player to continue safely.' : 'Could not capture the game. Your previous quick save is unchanged.'));
  };
  function request(loading) {
    return new Promise((resolve, reject) => {
      pending = { loading, resolve, reject };
      if (!module._ps2web_quick_state(loading ? 1 : 0)) {
        pending = null;
        reject(new Error('The player is busy. Try again.'));
      }
    });
  }
  async function refresh() {
    try {
      const record = await storage(key);
      publish({ available: true, exists: !!record, compatible: compatible(record), message: record ? compatible(record) ? savedMessage(record) : 'This quick save belongs to different game data.' : 'No quick save yet. One slot, stored on this device.' });
    } catch {
      publish({ available: false, message: 'Quick save storage is unavailable in this browser.' });
    }
  }
  async function operate(loading) {
    if (busy || !module.running) return;
    busy = true;
    publish({ busy: true, message: loading ? 'Loading quick save…' : 'Saving…' });
    try {
      if (loading) {
        const record = await storage(key);
        if (!record) throw new Error('No quick save yet.');
        if (!compatible(record)) throw new Error('This quick save belongs to different game data.');
        if (!(record.bytes instanceof Uint8Array) || await hash(record.bytes) !== record.digest) throw new Error('The quick save is damaged. It has not been loaded.');
        fileSystem().writeFile(STATE_FILE, record.bytes);
        await request(true);
        publish({ message: 'Quick save loaded.' });
      } else {
        await request(false);
        const bytes = fileSystem().readFile(STATE_FILE);
        const record = { bytes, digest: await hash(bytes), runtimeVersion: module.runtimeVersion, gameId: module.gameId, savedAt: Date.now() };
        await storage(key, record);
        publish({ available: true, exists: true, compatible: true, message: savedMessage(record) });
      }
      return true;
    } catch (error) {
      publish({ message: error.name === 'QuotaExceededError' ? 'Not enough device storage. Your previous quick save is unchanged.' : error.message });
      return false;
    } finally {
      cleanup();
      busy = false;
      publish({ busy: false });
    }
  }
  return {
    refresh,
    save: () => operate(false),
    load: () => operate(true),
    stop: () => { if (pending) { pending.reject(new Error('The game stopped before the operation completed.')); pending = null; } },
  };
}
