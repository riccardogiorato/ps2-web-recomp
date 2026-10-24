import React, { useEffect, useState } from 'react';
import { appendSample, sparkPoints } from './telemetry.js';

function Metric({ label, value, sample, unit = '%', help, max = 100 }) {
  const [history, setHistory] = useState([]);
  useEffect(() => { setHistory((old) => appendSample(old, sample)); }, [sample]);
  return <span className="metric" title={help} tabIndex={0} aria-label={`${label}: ${value == null ? 'unavailable' : value + unit}. ${help}`}>
    <span className="metric-label">{label}</span><b>{value == null ? '—' : value}<small>{value == null ? '' : unit}</small></b>
    <svg className="spark" width="48" height="18" viewBox="0 0 48 18" aria-hidden="true"><polyline points={sparkPoints(history, max)} /></svg>
  </span>;
}

export default function Telemetry({ metrics }) {
  const round = (value) => value == null ? null : Math.round(value);
  return <>
    <Metric label="GPU time" value={round(metrics?.gpu)} sample={metrics?.gpu} help="Estimated GPU rendering time divided by elapsed time. Not whole-device GPU utilization. A dash means no timing samples yet or timing unavailable." />
    {['emu', 'vu', 'gs'].map((key) => <Metric key={key} label={key.toUpperCase()} value={round(metrics?.[key])} sample={metrics?.[key]} help={`${({ emu: 'Emulation', vu: 'Vector unit', gs: 'Graphics' })[key]} thread active estimate: 100% minus measured waiting time. Not whole-device CPU utilization.`} />)}
    <Metric label="Heap" value={round(metrics?.heap)} sample={metrics?.heap} unit=" MiB" max={1024} help="Allocated WebAssembly memory, not used memory or VRAM." />
    <Metric label="Audio" value={round(metrics?.audio)} sample={metrics?.audio} unit=" ms" max={100} help="Audio queued for playback. Not total end-to-end audio latency." />
    <span className="metric" title="Frames actually displayed by the browser"><span className="metric-label">Shown</span><b>{round(metrics?.shown) ?? '—'}<small> FPS</small></b></span>
    <span className="metric" title="VU1 programs executed by the interpreter rather than compiled code"><span className="metric-label">VU fallback</span><b>{round(metrics?.interpreted) ?? '—'}<small>/s</small></b></span>
    <span className="metric"><span className="metric-label">Frame</span><b>{round(metrics?.frame) ?? '—'}</b></span>
  </>;
}
