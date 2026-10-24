export function normalizeVideoSettings(value = {}) {
  return { aa: value?.aa === 'on' ? 'on' : 'off' };
}
export function videoFlags(value) {
  return normalizeVideoSettings(value).aa === 'on' ? 1 : 0;
}
export function bindVideoSettings(module) {
  let stored;
  try { stored = JSON.parse(localStorage.getItem('ps2web-video') || '{}'); } catch {}
  let settings = normalizeVideoSettings(stored);
  const control = document.getElementById('video-aa');
  const apply = () => {
    module.videoSettings = { ...settings };
    module._ps2web_video_options?.(videoFlags(settings));
  };
  // Drop previous advanced settings so hidden effects cannot stay enabled.
  try { localStorage.setItem('ps2web-video', JSON.stringify(settings)); } catch {}
  control.checked = settings.aa === 'on';
  control.addEventListener('change', () => {
    settings = { aa: control.checked ? 'on' : 'off' };
    try { localStorage.setItem('ps2web-video', JSON.stringify(settings)); } catch {}
    apply();
  });
  module.refreshVideoControls = () => {
    const available = module.videoEffectsAvailable ?? (!!navigator.gpu && !module.gpuHelp && !module.presentCopy && !module.noSurface);
    control.disabled = !available;
    document.getElementById('video-help').textContent = available ? 'Smooths jagged edges. Applies immediately.' : 'Antialiasing needs direct WebGPU presentation.';
    apply();
  };
  apply();
  return { refresh: module.refreshVideoControls };
}
