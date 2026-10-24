export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value === 0) return '0 MB';
  const unit = value >= 1e9 ? 'GB' : value >= 1e6 ? 'MB' : 'KB';
  const size = value / (unit === 'GB' ? 1e9 : unit === 'MB' ? 1e6 : 1e3);
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${unit}`;
}

export function runtimeDownload(text, expectedBytes) {
  const match = text.match(/^Downloading data.*?\(([\d.]+)\s*\/\s*([\d.]+)\)/i);
  if (match) return { message: 'Preparing startup data', bytes: Number(match[1]), totalBytes: expectedBytes > 0 ? expectedBytes : Number(match[2]) };
  return { message: /^Downloading data/i.test(text) ? 'Preparing startup data…' : text };
}

export function downloadView(download = {}) {
  const loaded = Math.max(0, download.loadedBytes ?? download.bytes ?? 0);
  const total = download.totalSize ?? download.totalBytes;
  const fraction = Number.isFinite(total) && total > 0 ? Math.min(1, loaded / total) : null;
  const percent = fraction == null ? null : Math.floor(fraction * 100);
  const label = download.message || (download.done ? 'Player files ready' : download.cached ? 'Using saved player files' : download.file?.endsWith('.wasm') ? 'Downloading game engine' : download.file?.endsWith('.data') ? 'Downloading startup data' : 'Downloading player interface');
  return { label, fraction, percent, remaining: percent == null ? null : 100 - percent,
    size: total > 0 ? `${formatBytes(Math.min(loaded, total))} / ${formatBytes(total)}` : loaded > 0 ? `${formatBytes(loaded)} prepared` : null };
}
