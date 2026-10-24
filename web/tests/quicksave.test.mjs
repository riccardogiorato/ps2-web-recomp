import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuickSave } from '../src/quicksave.js';

function player(slots = new Map(), version = 'engine-1') {
  let status, file, capture = 1, failWrite = false, held = false;
  const operations = [];
  const module = { discUrl: 'disc.iso', runtimeVersion: version, gameId: 'kh2-data', running: true,
    _ps2web_quick_state(load) {
      operations.push(load);
      if (!load) file = new Uint8Array([capture++]);
      if (!held) queueMicrotask(() => module.onQuickState(!!load, true));
      return 1;
    },
  };
  const controller = createQuickSave({ module, base: 'https://player.test/kh2/', onChange(next) { status = next; },
    fileSystem: () => ({ readFile: () => file.slice(), writeFile: (_path, data) => { file = data; }, unlink: () => { file = undefined; } }),
    storage: async (key, record) => {
      if (record === undefined) return structuredClone(slots.get(key));
      if (failWrite) throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
      slots.set(key, structuredClone(record));
    },
  });
  return { controller, module, operations, slots, get status() { return status; }, setFailWrite() { failWrite = true; }, hold() { held = true; } };
}

test('quick save replaces one slot and can load it in a new player session', async () => {
  const p = player(); await p.controller.refresh(); assert.equal(p.status.compatible, false);
  await p.controller.save(); await p.controller.save();
  assert.equal(p.slots.size, 1);
  assert.deepEqual([...p.slots.values()][0].bytes, new Uint8Array([2]));
  const next = player(p.slots); await next.controller.refresh();
  assert.equal(next.status.compatible, true);
  assert.equal(await next.controller.load(), true);
  assert.deepEqual(next.operations, [1]);
});

test('storage exhaustion preserves the previous snapshot', async () => {
  const p = player(); await p.controller.save();
  const before = structuredClone([...p.slots.values()][0]);
  p.setFailWrite(); assert.equal(await p.controller.save(), false);
  assert.deepEqual([...p.slots.values()][0], before);
  assert.match(p.status.message, /previous quick save is unchanged/);
  assert.equal(p.status.busy, false);
});

test('incompatible or corrupt snapshots are rejected before touching the running engine', async () => {
  const p = player(); await p.controller.save();
  const next = player(p.slots, 'engine-2'); next.module.gameId = 'different-game'; await next.controller.refresh();
  assert.equal(next.status.compatible, false);
  assert.equal(await next.controller.load(), false);
  assert.deepEqual(next.operations, []);
  [...p.slots.values()][0].bytes[0] ^= 1;
  assert.equal(await p.controller.load(), false);
  assert.match(p.status.message, /damaged/);
  assert.deepEqual(p.operations, [0]);
});

test('rendering updates and legacy slots do not invalidate the single quick save', async () => {
  const p = player(); await p.controller.save();
  const updated = player(p.slots, 'new-renderer'); await updated.controller.refresh();
  assert.equal(updated.status.compatible, true);
  assert.equal(await updated.controller.load(), true);
  delete [...p.slots.values()][0].gameId;
  const legacy = player(p.slots, 'another-renderer'); await legacy.controller.refresh();
  assert.equal(legacy.status.compatible, true);
  assert.equal(await legacy.controller.load(), true);
  assert.equal(p.slots.size, 1);
});

test('duplicate clicks cannot overlap state operations, and a stopped engine clears busy state', async () => {
  const p = player(); p.hold();
  const saving = p.controller.save();
  await p.controller.save(); await p.controller.load();
  assert.deepEqual(p.operations, [0]);
  p.controller.stop(); await saving;
  assert.equal(p.status.busy, false);
});
