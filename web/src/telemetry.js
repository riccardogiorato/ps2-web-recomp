export function appendSample(history, value, limit = 24) {
  if (!Number.isFinite(value)) return history;
  return [...history.slice(-(limit - 1)), value];
}

export function sparkPoints(history, max = 100) {
  const ceiling = Math.max(1, max, ...history);
  return history.map((value, i) => `${(i * 48 / Math.max(1, history.length - 1)).toFixed(1)},${(15 - Math.max(0, value) / ceiling * 13).toFixed(1)}`).join(' ');
}
