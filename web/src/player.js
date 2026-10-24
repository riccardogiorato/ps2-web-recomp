import { startAudio } from './audio.js';
import { createQuickSave } from './quicksave.js';
import { runtimeDownload } from './download.js';
import { createDiagnostics, browserReport } from './diagnostics.js';
import { buttonKeys as keyMap, stickKeys } from './keyboard.js';
import { bindVideoSettings } from './video-settings.js';

// Browser bridge for the PS2 runtime. Keep platform emulation outside the UI.
export function createPlayer({ onState, onMetrics, onQuickSave }) {
  const diagnostics = createDiagnostics();
  const warn = (...parts) => { diagnostics.log('warn', parts.join(' ')); console.warn(...parts); };
  window.addEventListener('error', (event) => diagnostics.log('error', event.message));
  window.addEventListener('unhandledrejection', (event) => diagnostics.log('error', String(event.reason)));
  const statusEl = document.getElementById('status');
  const CARD_DIR = '/memcard', CARD_FILE = '/memcard/Mcd001.ps2', CARD_BYTES = 8650752;
  let noteTimer = 0, noteRestore = '';
  function note(text) {
    if (!noteTimer) noteRestore = statusEl.textContent;
    clearTimeout(noteTimer);
    statusEl.textContent = text;
    noteTimer = setTimeout(() => {
      statusEl.textContent = noteRestore;
      noteTimer = 0;
    }, 5000);
  }
  let cardTimer = 0;
  function storeCard(then) {
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => {
      try {
        FS.syncfs(false, (err) => {
          if (err) warn('memory card: could not write browser storage', err);
          if (then) then();
        });
      } catch (e) {
        if (then) then();
      }
    }, 300);
  }
  document.getElementById('export-card').addEventListener('click', () => {
    let data = null;
    try { data = FS.readFile(CARD_FILE); } catch (e) {}
    if (!data) {
      note('Nothing saved on the memory card yet');
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    link.download = 'Mcd001.ps2';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  });
  const importInput = document.getElementById('import-file');
  document.getElementById('import-card').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;
    if (file.size !== CARD_BYTES) {
      note('That is not an 8 MB PS2 memory card image (' + CARD_BYTES + ' bytes)');
      return;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(data.subarray(0, 28)) !== 'Sony PS2 Memory Card Format ') {
      note('That file is not a formatted PS2 memory card');
      return;
    }
    if (!confirm('Replace the memory card in slot 1 with ' + file.name + '? The page reloads to use it.')) return;
    try {
      FS.writeFile(CARD_FILE, data);
    } catch (e) {
      note('Import failed: ' + e.message);
      return;
    }
    storeCard(() => location.reload());
  });
  const canvas = document.getElementById('canvas');
  const params = new URLSearchParams(location.search);

  function missingFeatures() {
    const header = [0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10];
    const accepts = (body) => {
      try {
        return WebAssembly.validate(new Uint8Array(header.concat([body.length + 2, 1, body.length], body)));
      } catch (e) {
        return false;
      }
    };
    const missing = [];
    if (!window.crossOriginIsolated) missing.push('cross-origin isolation (COOP and COEP headers)');
    if (typeof WebAssembly.Suspending !== 'function') missing.push('WebAssembly JSPI');
    if (!accepts([0, 0x1F, 0x40, 0, 0x0B, 0x0B])) missing.push('WebAssembly exception handling (try_table)');
    if (!accepts([0, 0x12, 0, 0x0B])) missing.push('WebAssembly tail calls');
    if (!accepts([0, 0xFD, 0x0C].concat(new Array(16).fill(0), [0x1A, 0x0B]))) missing.push('WebAssembly SIMD');
    return missing;
  }
  const missing = missingFeatures();

  const touchRoot = document.getElementById('touch'), knob = document.getElementById('knob');
  let touchPad = { buttons: 0, x: 0, y: 0, stick: false, rx: 0, ry: 0, rightStick: false };
  const fingers = new Map();
  if (matchMedia('(pointer: coarse)').matches || params.has('touch')) document.body.classList.add('touch');
  function circleOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  }
  function onTouch(e) {
    e.preventDefault();
    const seen = new Set();
    let buttons = 0, sx = 0, sy = 0, stick = false, rx = 0, ry = 0, rightStick = false;
    for (const t of e.touches) {
      seen.add(t.identifier);
      let f = fingers.get(t.identifier);
      if (!f) {
        const start = document.elementFromPoint(t.clientX, t.clientY);
        const region = start && start.closest('[data-stick],[data-dpad]');
        f = region ? { kind: region.hasAttribute('data-stick') ? 'stick' : 'dpad', el: region } : { kind: 'button' };
        fingers.set(t.identifier, f);
      }
      if (f.kind === 'stick') {
        const c = circleOf(f.el);
        let dx = (t.clientX - c.x) / c.r, dy = (t.clientY - c.y) / c.r;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        if (f.el.dataset.stick === 'right') { rx = dx; ry = dy; rightStick = true; }
        else { sx = dx; sy = dy; stick = true; }
        f.el.querySelector('.knob').style.transform = 'translate(' + (dx * c.r * 0.6) + 'px,' + (dy * c.r * 0.6) + 'px)';
      } else if (f.kind === 'dpad') {
        const d = circleOf(f.el), ox = t.clientX - d.x, oy = t.clientY - d.y;
        if (Math.hypot(ox, oy) > d.r * 0.2) {
          const angle = Math.atan2(oy, ox) * 180 / Math.PI;
          if (angle > -67.5 && angle < 67.5) buttons |= 0x20;
          if (angle > 22.5 && angle < 157.5) buttons |= 0x40;
          if (angle > 112.5 || angle < -112.5) buttons |= 0x80;
          if (angle > -157.5 && angle < -22.5) buttons |= 0x10;
        }
      } else {
        const over = document.elementFromPoint(t.clientX, t.clientY);
        const button = over && over.closest('[data-btn]');
        if (button && touchRoot.contains(button)) buttons |= Number(button.dataset.btn);
      }
    }
    for (const id of [...fingers.keys()]) if (!seen.has(id)) fingers.delete(id);
    if (!stick) knob.style.transform = '';
    if (!rightStick) document.getElementById('right-knob').style.transform = '';
    touchPad = { buttons, x: sx, y: sy, stick, rx, ry, rightStick };
    touchRoot.querySelectorAll('[data-btn]').forEach((el) => el.classList.toggle('on', (buttons & Number(el.dataset.btn)) !== 0));
    touchRoot.querySelectorAll('[data-dir]').forEach((el) => el.classList.toggle('on', (buttons & Number(el.dataset.dir)) !== 0));
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) touchRoot.addEventListener(type, onTouch, { passive: false });

  const scaleSelect = document.getElementById('scale');
  let scale = params.get('PS2_SCALE');
  if (!scale) {
    try { scale = localStorage.getItem('ps2web-scale'); } catch (e) {}
  }
  scale = ['1', '2', '3'].includes(scale) ? scale : '1';
  scaleSelect.value = scale;
  scaleSelect.addEventListener('change', () => {
    try { localStorage.setItem('ps2web-scale', scaleSelect.value); } catch (e) {}
    const url = new URL(location.href);
    url.searchParams.delete('PS2_SCALE');
    location.href = url.href;
  });

  const aspectSelect = document.getElementById('aspect');
  let aspect = params.get('aspect');
  if (!aspect) {
    try { aspect = localStorage.getItem('ps2web-aspect'); } catch (e) {}
  }
  aspect = aspect === '16:9' ? '16:9' : '4:3';
  aspectSelect.value = aspect;
  document.body.classList.toggle('wide', aspect === '16:9');
  aspectSelect.addEventListener('change', () => {
    try { localStorage.setItem('ps2web-aspect', aspectSelect.value); } catch (e) {}
    const url = new URL(location.href);
    url.searchParams.delete('aspect');
    location.href = url.href;
  });

  const controlsButton = document.getElementById('controls-toggle');
  let hideControls = false;
  try { hideControls = localStorage.getItem('ps2web-hide-controls') === '1'; } catch (e) {}
  function updateControls() {
    const touch = document.body.classList.contains('touch');
    document.body.classList.toggle('hide-controls', hideControls);
    controlsButton.hidden = !touch;
    controlsButton.textContent = hideControls ? 'Show controls' : 'Hide controls';
    fitCanvas();
  }
  controlsButton.addEventListener('click', () => {
    hideControls = !hideControls;
    try { localStorage.setItem('ps2web-hide-controls', hideControls ? '1' : '0'); } catch (e) {}
    updateControls();
  });

  function fitCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      if (Module.running && Module._ps2web_resize) Module._ps2web_resize(width, height);
    }
  }
  window.addEventListener('resize', fitCanvas);

  const fullscreenButton = document.getElementById('fullscreen');
  const root = document.documentElement;
  const requestFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
  const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
  const nativeFullscreen = () => document.fullscreenElement || document.webkitFullscreenElement;
  let fullscreen = false;
  function setFullscreen(on) {
    fullscreen = on;
    document.body.classList.toggle('fullscreen', on);
    fullscreenButton.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
    fullscreenButton.title = on ? 'Exit fullscreen' : 'Fullscreen';
    fullscreenButton.setAttribute('aria-pressed', String(on));
    fitCanvas();
  }
  function toggleFullscreen() {
    if (fullscreen) {
      if (nativeFullscreen() && exitFullscreen) exitFullscreen.call(document);
      setFullscreen(false);
      return;
    }
    setFullscreen(true);
    if (!requestFullscreen) return;
    const result = requestFullscreen.call(root, { navigationUI: 'hide' });
    if (result && result.then) {
      result.then(() => {
        if (document.body.classList.contains('touch') && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => {});
    }
  }
  function onFullscreenChange() {
    if (!nativeFullscreen() && fullscreen && requestFullscreen) setFullscreen(false);
    else fitCanvas();
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  fullscreenButton.addEventListener('click', toggleFullscreen);
  canvas.addEventListener('dblclick', toggleFullscreen);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || e.target.closest('button, input, select, dialog')) return;
    e.preventDefault();
    toggleFullscreen();
  });

  const keys = new Set();
  window.addEventListener('keydown', (e) => { if (!e.target.closest('button, input, select, dialog') && (e.code in keyMap || stickKeys.has(e.code))) { keys.add(e.code); e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); });
  const padButtons = [[0, 14], [1, 13], [2, 15], [3, 12], [4, 10], [5, 11], [6, 8], [7, 9], [8, 0], [9, 3], [10, 1], [11, 2],
                      [12, 4], [13, 6], [14, 7], [15, 5]];
  const axis = (v) => Math.max(0, Math.min(255, Math.round((v + 1) * 127.5)));
  // the keyboard and touch controls are player 1 along with the first gamepad, a second gamepad is player 2
  const players = [0, 1].map(() => ({ plugged: false, pad: -1, pressure: '', strong: 0, weak: 0, rumbleAt: 0 }));
  const motorStrength = (v) => v < 16 ? 0 : Math.sqrt(v / 255);
  function pollPlayer(port, gamepad, own) {
    const player = players[port];
    const plugged = port === 0 || !!gamepad;
    if (plugged !== player.plugged) {
      player.plugged = plugged;
      Module._ps2web_pad_connected(port, plugged ? 1 : 0);
    }
    if (!plugged) return;
    let buttons = 0, lx = 128, ly = 128, rx = 128, ry = 128;
    const pressure = new Array(16).fill(255);
    const acceptsInput = !document.getElementById('settings').open;
    if (own && acceptsInput) {
      buttons |= touchPad.buttons;
      for (const k of keys) if (k in keyMap) buttons |= 1 << keyMap[k];
      if (keys.has('KeyJ')) lx = 0;
      if (keys.has('KeyL')) lx = 255;
      if (keys.has('KeyI')) ly = 0;
      if (keys.has('KeyK')) ly = 255;
      if (touchPad.stick) {
        lx = axis(touchPad.x);
        ly = axis(touchPad.y);
      }
    }
    if (own && acceptsInput && touchPad.rightStick) { rx = axis(touchPad.rx); ry = axis(touchPad.ry); }
    const full = buttons;
    if (gamepad && acceptsInput) {
      for (const [index, bit] of padButtons) {
        const b = gamepad.buttons[index];
        if (!b || !(b.pressed || b.value > 0.05)) continue;
        buttons |= 1 << bit;
        if (!(full & (1 << bit))) pressure[bit] = Math.max(1, Math.round((b.value > 0 ? b.value : 1) * 255));
      }
      if (gamepad.axes.length >= 4) {
        if (lx === 128) lx = axis(gamepad.axes[0]);
        if (ly === 128) ly = axis(gamepad.axes[1]);
        if (!own || !touchPad.rightStick) { rx = axis(gamepad.axes[2]); ry = axis(gamepad.axes[3]); }
      }
    }
    const state = buttons + lx * 65536 + ly * 16777216 + rx * 4294967296 + ry * 1099511627776;
    if (state !== player.pad) {
      player.pad = state;
      Module._ps2web_pad(port, buttons, lx, ly, rx, ry);
    }
    const packed = [0, 1, 2, 3].map((i) => pressure[i * 4] | (pressure[i * 4 + 1] << 8) | (pressure[i * 4 + 2] << 16) | (pressure[i * 4 + 3] << 24));
    if (packed.join() !== player.pressure) {
      player.pressure = packed.join();
      Module._ps2web_pressure(port, packed[0], packed[1], packed[2], packed[3]);
    }
    const rumble = Module._ps2web_rumble(port), now = performance.now();
    const strong = motorStrength(rumble >> 8), weak = rumble & 1;
    const actuator = gamepad && gamepad.vibrationActuator;
    if (actuator && (Math.abs(strong - player.strong) > 0.08 || weak !== player.weak || ((strong || weak) && now - player.rumbleAt > 100))) {
      player.strong = strong;
      player.weak = weak;
      player.rumbleAt = now;
      const done = strong || weak ? actuator.playEffect('dual-rumble', { duration: 200, weakMagnitude: weak, strongMagnitude: strong }) : actuator.reset();
      if (done && done.catch) done.catch(() => {});
    }
  }
  function pollInput() {
    const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((pad) => pad);
    pollPlayer(0, pads[0] || null, true);
    pollPlayer(1, pads[1] || null, false);
  }

  // some browsers cannot show a canvas drawn by another GPU (hybrid laptops on Linux), so each adapter draws a few test frames first
  async function canPresent(power) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: power });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    let failed = false;
    device.lost.then((info) => {
      if (info.reason === 'destroyed') return;
      failed = true;
      warn('[gpu check] ' + power + ' device lost: ' + info.message);
    });
    device.onuncapturederror = (e) => {
      failed = true;
      warn('[gpu check] ' + power + ': ' + e.error.message);
    };
    const probe = document.createElement('canvas');
    probe.width = probe.height = 64;
    probe.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none';
    document.body.appendChild(probe);
    try {
      const context = probe.getContext('webgpu');
      context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
      for (let i = 0; i < 3 && !failed; ++i) {
        const encoder = device.createCommandEncoder();
        encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] }).end();
        device.queue.submit([encoder.finish()]);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await device.queue.onSubmittedWorkDone();
      }
    } catch (e) {
      failed = true;
      warn('[gpu check] ' + power + ': ' + e);
    }
    probe.remove();
    const name = [adapter.info.vendor, adapter.info.architecture].filter(Boolean).join(' ') || power;
    if (!failed) Module.adapterInfo = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, fallback: adapter.info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null, powerPreference: power, features: [...adapter.features] };
    device.destroy();
    return failed ? null : name;
  }

  function webgpuHelp(onCpu) {
    const firefox = navigator.userAgent.includes('Firefox/');
    const linux = navigator.userAgent.includes('Linux') && !navigator.userAgent.includes('Android');
    if (firefox) return 'WebGPU is turned off in this Firefox, so the game runs on the slow software renderer. Set dom.webgpu.enabled to true in about:config and reload.';
    if (linux && onCpu) return 'WebGPU runs on the CPU here, so the game is slow. Turn on chrome://flags/#enable-vulkan as well, then restart the browser.';
    if (linux) return 'WebGPU is turned off in this browser, so the game runs on the slow software renderer. Turn on chrome://flags/#enable-unsafe-webgpu and chrome://flags/#enable-vulkan, then restart the browser.';
    return 'This browser has no WebGPU, so the game runs on the slow software renderer. A current Chrome, Edge or Safari is much faster.';
  }

  async function chooseGpu() {
    if (!navigator.gpu) {
      Module.gpuHelp = webgpuHelp(false);
      return 'WebGPU unavailable, software renderer';
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      Module.gpuHelp = webgpuHelp(false);
      return 'WebGPU has no adapter, software renderer';
    }
    Module.adapterInfo = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, fallback: adapter.info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null, features: [...adapter.features] };
    if (adapter.info.isFallbackAdapter || adapter.info.architecture === 'swiftshader') Module.gpuHelp = webgpuHelp(true);
    if (navigator.userAgent.includes('Firefox/')) {
      Module.presentCopy = true;
      return 'Firefox, frames copied to the page';
    }
    const forced = params.get('gpu');
    if (forced !== 'low') {
      const name = await canPresent('high-performance');
      if (name) return 'GPU ' + name;
    }
    const name = await canPresent('low-power');
    if (name) {
      Module.ENV.PS2_GPU_LOW_POWER = '1';
      return 'GPU ' + name;
    }
    Module.presentCopy = true;
    return 'GPU cannot draw to the page, copying frames';
  }

  let frames = 0, last = performance.now(), lastGpu = 0, lastEmuIdle = 0, lastRenderIdle = 0, lastVuIdle = 0, lastInterpreted = 0;
  let shown = 0, fresh = false, lastEmulatedFrame = 0;
  const countShown = (now) => {
    diagnostics.raf(now);
    if (fresh) ++shown;
    fresh = false;
    requestAnimationFrame(countShown);
  };
  requestAnimationFrame(countShown);
  var Module = {
    canvas,
    arguments: ['/game/core.elf'].concat(params.has('arg') ? ['--arg', params.get('arg')] : [], aspect === '16:9' ? ['--widescreen'] : [], params.getAll('press').flatMap((p) => p.split(',').flatMap((x) => ['--press', x]))),
    discUrl: params.get('disc') || 'disc.iso',
    stateUrl: params.get('state'),
    noSurface: params.has('nosurface'),
    noCard: params.has('nocard'),
    presentCopy: params.has('copy'),
    onHalt: (reason) => {
      diagnostics.log('halt', reason);
      Module.running = false;
      quick.stop();
      clearTimeout(noteTimer);
      noteTimer = 0;
      statusEl.textContent = 'Halted: ' + reason;
      onState({ phase: 'halted', message: reason });
    },
    print: (text) => { diagnostics.log('stdout', text); console.log(text); },
    printErr: (text) => { diagnostics.log('stderr', text); console.log(text); },
    setStatus: (text) => {
      if (!text || Module.gpuInfo) return;
      const download = runtimeDownload(text, Module.startupDataBytes);
      statusEl.textContent = download.message;
      onState({ phase: 'loading', message: download.message, download });
    },
    onAbort: (reason) => { diagnostics.log('abort', reason); Module.running = false; quick.stop(); onState({ phase: 'error', message: String(reason) }); },
    onRuntimeInitialized: () => {
      video.refresh();
      if (!missing.length) onState({ phase: 'ready', message: 'Ready to play' });
      quick.refresh();
    },
    preRun: [() => {
      if (!Module.noCard) {
        try {
          FS.mkdir(CARD_DIR);
          FS.mount(IDBFS, {}, CARD_DIR);
          Module.addRunDependency('card');
          FS.syncfs(true, (err) => {
            if (err) warn('memory card: could not read browser storage', err);
            Module.removeRunDependency('card');
          });
        } catch (e) {
          warn('memory card: browser storage is not available', e);
        }
      }
      for (const [key, value] of params) if (key.startsWith('PS2_')) Module.ENV[key] = value;
      Module.ENV.PS2_SCALE = scale;
      Module.addRunDependency('disc');
      Promise.all([fetch(Module.discUrl, { method: 'HEAD' }), chooseGpu().catch((e) => 'GPU check failed: ' + e)]).then(([r, gpu]) => {
        diagnostics.log('disc', 'Disc HEAD status ' + r.status);
        if (!r.ok) throw new Error('Disc request returned HTTP ' + r.status);
        Module.discSize = Number(r.headers.get('content-length')) || 0;
        Module.gpuInfo = gpu;
        if (Module.gpuHelp && !missing.length) {
          const help = document.getElementById('help');
          help.textContent = Module.gpuHelp;
          help.hidden = false;
        }
        statusEl.textContent = (Module.discSize ? 'Disc ' + (Module.discSize / 1073741824).toFixed(2) + ' GB' : 'No disc image at ' + Module.discUrl) + ', ' + gpu;
        Module.removeRunDependency('disc');
      }).catch((error) => {
        diagnostics.log('error', error.message);
        onState({ phase: 'error', message: 'Could not open the disc: ' + error.message });
      });
    }],
    audioQueuedMs: () => Module._ps2web_audio_queued_ms(),
    ps2CardSaved: () => storeCard(),
    onFrame: () => {
      pollInput();
      ++frames;
      fresh = true;
      const now = performance.now();
      diagnostics.frame(now);
      if (now - last >= 1000) {
        const gpu = Module._ps2web_gpu_ms();
        const memory = (Module.HEAPU8.length / 1048576).toFixed(0);
        const emuIdle = Module._ps2web_idle_ms(0), renderIdle = Module._ps2web_idle_ms(1), vuIdle = Module._ps2web_idle_ms(2), span = now - last;
        const interpreted = Module._ps2web_vu_interpreted();
        const emulatedFrame = Module._ps2web_frames();
        const sample = {
          fps: frames * 1000 / span,
          shown: shown * 1000 / span,
          gpu: gpu > 0 ? Math.max(0, (gpu - lastGpu) / span * 100) : null,
          emu: Math.max(0, Math.min(100, 100 - (emuIdle - lastEmuIdle) / span * 100)),
          vu: Math.max(0, Math.min(100, 100 - (vuIdle - lastVuIdle) / span * 100)),
          gs: Math.max(0, Math.min(100, 100 - (renderIdle - lastRenderIdle) / span * 100)),
          heap: Number(memory), audio: Module.audioQueuedMs(),
          frame: emulatedFrame,
          emulatedFps: emulatedFrame >= lastEmulatedFrame ? (emulatedFrame - lastEmulatedFrame) * 1000 / span : null,
          interpreted: Math.max(0, (interpreted - lastInterpreted) * 1000 / span),
        };
        diagnostics.metrics(sample);
        onMetrics(sample);
        lastEmulatedFrame = emulatedFrame;
        lastInterpreted = interpreted;
        lastEmuIdle = emuIdle;
        lastRenderIdle = renderIdle;
        lastVuIdle = vuIdle;
        lastGpu = gpu;
        frames = 0;
        shown = 0;
        last = now;
      }
    },
    noInitialRun: true,
  };

  updateControls();
  if (missing.length) onState({ phase: 'error', message: 'This browser lacks ' + missing.join(', ') + '. Try a current Chrome or Edge.' });

  document.getElementById('start').addEventListener('click', async () => {
    onState({ phase: 'starting', message: 'Starting audio and game…' });
    canvas.focus();
    fitCanvas();
    try { Module.audioOutput = await startAudio(Module); } catch (error) {
      onState({ phase: 'error', message: 'Audio could not start: ' + error.message });
      return;
    }
    statusEl.textContent = 'Running, ' + Module.gpuInfo;
    Module.running = true;
    onState({ phase: 'running', message: Module.gpuInfo });
    try { await Module.callMain([...Module.arguments]); } catch (error) {
      onState({ phase: 'error', message: String(error) });
    }
  });

  window.addEventListener('blur', () => {
    keys.clear(); fingers.clear();
    touchPad = { buttons: 0, x: 0, y: 0, stick: false, rx: 0, ry: 0, rightStick: false };
    touchRoot.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
    touchRoot.querySelectorAll('.knob').forEach((el) => { el.style.transform = ''; });
  });
  const sizeObserver = new ResizeObserver(() => {
    document.body.style.setProperty('--bar-height', document.getElementById('bar').offsetHeight + 'px');
    fitCanvas();
  });
  sizeObserver.observe(document.getElementById('bar'));
  sizeObserver.observe(document.getElementById('stage'));
  const video = bindVideoSettings(Module);
  const quick = createQuickSave({ module: Module, fileSystem: () => FS, onChange: onQuickSave });
  const quickComplete = Module.onQuickState;
  Module.onQuickState = (loading, success) => {
    diagnostics.log('state', `${loading ? 'Quick Load' : 'Quick Save'} ${success ? 'completed' : 'failed'}`);
    if (loading && success) {
      // A state restore jumps the emulated frame number. Begin a new window
      // rather than reporting that jump as thousands of emulated FPS.
      lastEmulatedFrame = Module._ps2web_frames();
      last = performance.now();
      frames = shown = 0;
      fresh = false;
      lastGpu = Module._ps2web_gpu_ms();
      lastEmuIdle = Module._ps2web_idle_ms(0);
      lastRenderIdle = Module._ps2web_idle_ms(1);
      lastVuIdle = Module._ps2web_idle_ms(2);
      lastInterpreted = Module._ps2web_vu_interpreted();
      diagnostics.resetTiming();
    }
    quickComplete(loading, success);
  };
  window.Module = Module;
  return { module: Module, supported: !missing.length, quick,
    getDiagnostics: () => browserReport(Module, diagnostics, { scale: Number(scale), aspect, picture: Module.videoSettings, effectsAvailable: Module.videoEffectsAvailable ?? null, missingFeatures: missing, memoryCardEnabled: !Module.noCard }),
  };

}
