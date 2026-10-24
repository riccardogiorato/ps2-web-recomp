import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, runtimeDownload, downloadView } from '../src/download.js';

test('download sizes use readable decimal units with bounded precision', () => {
  assert.equal(formatBytes(12400000), '12.4 MB');
  assert.equal(formatBytes(6400000000), '6.4 GB');
  assert.equal(formatBytes(0), '0 MB');
  assert.equal(formatBytes(NaN), '—');
});

test('runtime byte counters become human-readable progress, using decoded size for compressed responses', () => {
  const event = runtimeDownload('Downloading data... (12400000/1000000)', 24800000);
  const view = downloadView(event);
  assert.equal(view.label, 'Preparing startup data');
  assert.equal(view.size, '12.4 MB / 24.8 MB');
  assert.equal(view.percent, 50);
  assert.equal(view.remaining, 50);
});

test('preparation uses byte totals rather than file counts and keeps unknown totals indeterminate', () => {
  const view = downloadView({ loadedBytes: 1000000, totalSize: 10000000, index: 4, count: 5 });
  assert.equal(view.percent, 10);
  assert.equal(downloadView({ bytes: 8000, index: 4, count: 5 }).fraction, null);
  assert.equal(downloadView({ loadedBytes: 120, totalSize: 100 }).remaining, 0);
  assert.equal(runtimeDownload('Downloading data...').message, 'Preparing startup data…');
});
