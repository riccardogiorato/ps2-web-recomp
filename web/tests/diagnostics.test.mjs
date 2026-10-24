import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnostics, timingSummary } from '../src/diagnostics.js';

test('timing report exposes long frames hidden by average FPS', () => {
  const summary = timingSummary([20, 20, 20, 20, 100, NaN, -1]);
  assert.equal(summary.medianMs, 20);
  assert.equal(summary.p95Ms, 100);
  assert.equal(summary.over50ms, 1);
  assert.equal(timingSummary([]), null);
});

test('diagnostics stay bounded, compact repeated messages and strip URL queries from logs', () => {
  const d = createDiagnostics();
  for (let i = 0; i < 300; i++) { d.log('info', 'line ' + i); d.frame(i * 20); d.raf(i * 16.7); d.metrics({ fps: i }); }
  d.log('error', 'Fetch https://example.test/disc.iso?token=secret#fragment');
  d.log('error', 'Fetch https://example.test/disc.iso?token=secret#fragment');
  const result = d.snapshot();
  assert.equal(result.logs.length, 200);
  assert.equal(result.logs.at(-1).repeats, 2);
  assert.equal(result.logs.at(-1).message, 'Fetch /disc.iso');
  assert.equal(result.recentMetrics.length, 30);
  assert.equal(result.latest.fps, 299);
  assert.equal(result.timing.submittedFrames.samples, 240);
  assert.equal(result.timing.animationFrames.samples, 240);
  d.resetTiming();
  assert.equal(d.snapshot().latest, null);
  assert.equal(d.snapshot().timing.submittedFrames, null);
  assert.equal(d.snapshot().logs.length, 200);
  d.frame(100000);
  d.frame(100020);
  assert.equal(d.snapshot().timing.submittedFrames.maxMs, 20);
});
