import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVideoSettings, videoFlags } from '../src/video-settings.js';

test('picture settings preserve the original output by default and reject invalid stored values', () => {
  assert.equal(videoFlags({}), 0);
  assert.equal(videoFlags({ aa: 'invalid', sharpness: '999', filter: null }), 0);
  assert.deepEqual(normalizeVideoSettings(null), normalizeVideoSettings({}));
});

test('legacy advanced settings cannot leave hidden effects enabled', () => {
  const legacy = { aa: 'on', filter: 'nearest', deinterlace: 'adaptive', sharpness: '40' };
  assert.deepEqual(normalizeVideoSettings(legacy), { aa: 'on' });
  assert.equal(videoFlags(legacy), 1);
  assert.equal(videoFlags({ ...legacy, aa: 'off' }), 0);
});
