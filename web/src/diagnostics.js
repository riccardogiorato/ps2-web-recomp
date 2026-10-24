const round = (n) => Math.round(n * 100) / 100;
export function timingSummary(samples) {
  const values = samples.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!values.length) return null;
  return { samples: values.length, meanMs: round(values.reduce((a, b) => a + b, 0) / values.length),
    medianMs: round(values[Math.floor((values.length - 1) * .5)]), p95Ms: round(values[Math.ceil(values.length * .95) - 1]),
    maxMs: round(values.at(-1)), over33ms: values.filter((n) => n > 33.4).length, over50ms: values.filter((n) => n > 50).length };
}

function cleanText(text) {
  return String(text).replace(/https?:\/\/[^\s"'<>]+/g, (value) => {
    try { return new URL(value).pathname; } catch { return '[URL]'; }
  }).slice(0, 800);
}

export function createDiagnostics() {
  const logs = [], metrics = [], frameIntervals = [], rafIntervals = [];
  let lastFrame, lastRaf;
  const append = (list, value, limit) => { list.push(value); if (list.length > limit) list.shift(); };
  return {
    log(level, text) {
      const message = cleanText(text), previous = logs.at(-1);
      if (previous?.message === message && previous.level === level) { previous.repeats++; previous.at = new Date().toISOString(); return; }
      append(logs, { at: new Date().toISOString(), level, message, repeats: 1 }, 200);
    },
    frame(now) { if (lastFrame != null) append(frameIntervals, now - lastFrame, 240); lastFrame = now; },
    raf(now) { if (lastRaf != null) append(rafIntervals, now - lastRaf, 240); lastRaf = now; },
    metrics(sample) { append(metrics, { at: new Date().toISOString(), ...sample }, 30); },
    resetTiming() { frameIntervals.length = 0; rafIntervals.length = 0; metrics.length = 0; lastFrame = lastRaf = undefined; },
    snapshot() {
      return { notes: 'Thread activity and GPU time are estimates, not whole-device utilization. Shown FPS counts animation-frame opportunities with a new frame, not confirmed screen scanout. Timing windows include pauses or background-tab delays.',
        latest: metrics.at(-1) || null, recentMetrics: metrics.slice(),
        timing: { submittedFrames: timingSummary(frameIntervals), animationFrames: timingSummary(rafIntervals) },
        logs: logs.map((entry) => ({ ...entry })) };
    },
  };
}

export function browserReport(module, recorder, settings) {
  const audio = module.audioOutput?.audio;
  return JSON.stringify({ format: 'ps2-player-debug-v1', capturedAt: new Date().toISOString(),
    browser: { userAgent: navigator.userAgent, platform: navigator.platform, logicalProcessors: navigator.hardwareConcurrency,
      memoryGiB: navigator.deviceMemory ?? null, secureContext: isSecureContext, crossOriginIsolated,
      visibility: document.visibilityState, focused: document.hasFocus(), online: navigator.onLine,
      webgpuAvailable: !!navigator.gpu, serviceWorkerControlled: !!navigator.serviceWorker?.controller },
    display: { viewport: [innerWidth, innerHeight], screen: [screen.width, screen.height], devicePixelRatio,
      canvas: [module.canvas.width, module.canvas.height], fullscreen: !!document.fullscreenElement },
    player: { runtimeVersion: module.runtimeVersion, running: !!module.running, ...settings,
      gpu: module.gpuInfo || null, gpuHelp: module.gpuHelp || null, adapter: module.adapterInfo || null,
      presentation: module.presentCopy ? 'copied canvas' : module.gpuHelp ? 'software or fallback' : 'direct WebGPU',
      heapMiB: module.HEAPU8 ? round(module.HEAPU8.byteLength / 1048576) : null },
    audio: audio ? { state: audio.state, sampleRate: audio.sampleRate, baseLatencyMs: round(audio.baseLatency * 1000),
      outputLatencyMs: Number.isFinite(audio.outputLatency) ? round(audio.outputLatency * 1000) : null } : null,
    resources: performance.getEntriesByType('resource').filter((r) => /\/(disc\.iso|ps2web\.(wasm|data|js))$/.test(new URL(r.name).pathname)).slice(-30).map((r) => ({
      file: new URL(r.name).pathname.split('/').at(-1), durationMs: round(r.duration), transferBytes: r.transferSize,
      decodedBytes: r.decodedBodySize, status: r.responseStatus ?? null, workerStartMs: round(r.workerStart) })),
    ...recorder.snapshot(),
  }, (_key, value) => typeof value === 'number' ? round(value) : value, 2);
}

export async function copyReport(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const previous = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;width:1px;height:1px';
  // Keep the fallback inside the active modal so it can receive focus.
  (document.querySelector('dialog[open]') || document.body).append(field);
  field.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  field.remove();
  previous?.focus({ preventScroll: true });
  return copied;
}
