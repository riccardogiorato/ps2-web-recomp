import React, { useEffect, useRef, useState } from 'react';
import Controls from './Controls.jsx';
import Telemetry from './Telemetry.jsx';
import BootScene from './BootScene.jsx';
import LoadingProgress from './LoadingProgress.jsx';
import DebugReport from './DebugReport.jsx';
import KeyboardControls from './KeyboardControls.jsx';
import VideoSettings from './VideoSettings.jsx';
import { createPlayer } from './player.js';
import { loadRuntime, clearPlayerCache } from './loader.js';

function Icon({ name }) {
  const paths = {
    settings: <><path d="m9 3 .6-2h4.8l.6 2 2 .9 1.9-.5 2.4 4.2-1.4 1.5v2.3l1.4 1.5-2.4 4.2-1.9-.5-2 .9-.6 2H9l-.6-2-2-.9-1.9.5-2.4-4.2 1.4-1.5v-2.3L2.1 8.6l2.4-4.2 1.9.5Z" /><circle cx="12" cy="11.3" r="3" /></>,
    fullscreen: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    debug: <><path d="M4 19V9m5 10V5m5 14v-7m5 7V3" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    save: <><path d="M4 3h13l4 4v14H3V3Zm3 0v7h10V3M7 21v-7h10v7" /><path d="M14 5v3" /></>,
    load: <><path d="M4 10a8 8 0 1 1 0 6M4 4v6h6" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function initialDebug() {
  try { return new URLSearchParams(location.search).has('debug') || localStorage.getItem('ps2web-debug') === '1'; } catch { return false; }
}

export default function App() {
  const [state, setState] = useState({ phase: 'loading', message: 'Preparing the player…' });
  const [metrics, setMetrics] = useState(null);
  const [debug, setDebug] = useState(initialDebug);
  const [download, setDownload] = useState(null);
  const [cache, setCache] = useState('Checking downloaded player…');
  const [cacheBusy, setCacheBusy] = useState(false);
  const [quick, setQuick] = useState({ busy: false, available: false, compatible: false, message: 'Start the player to use quick save.' });
  const [showQuickNotice, setShowQuickNotice] = useState(false);
  const playerRef = useRef(null);
  const settings = useRef(null);

  useEffect(() => {
    const player = createPlayer({ onState: (next) => { setState((old) => ({ ...old, ...next })); if (next.phase === 'loading' || next.phase === 'starting') setDownload(next.download || { message: next.message }); }, onMetrics: setMetrics, onQuickSave: setQuick });
    playerRef.current = player;
    if (player.supported) loadRuntime(player.module, {
      onProgress: setDownload, onCache: setCache,
    }).catch((error) => setState({ phase: 'error', message: error.message }));
  }, []);

  useEffect(() => { try { localStorage.setItem('ps2web-debug', debug ? '1' : '0'); } catch {} }, [debug]);
  useEffect(() => {
    if (!showQuickNotice || quick.busy) return;
    const timer = setTimeout(() => setShowQuickNotice(false), 5000);
    return () => clearTimeout(timer);
  }, [showQuickNotice, quick.busy, quick.message]);
  const quickAction = (loading) => {
    setShowQuickNotice(true);
    return loading ? playerRef.current.quick.load() : playerRef.current.quick.save();
  };
  const toggleDebug = () => setDebug((value) => !value);
  const loading = ['loading', 'starting'].includes(state.phase);
  const running = state.phase === 'running';
  const error = state.phase === 'error' || state.phase === 'halted';
  return <>
    <main id="stage"><canvas id="canvas" tabIndex={0} aria-label="PS2 game display" /></main>
    <Controls />
    <footer id="bar">
      <div className="bar-main">
        <span className={`status-dot ${error ? 'error' : running ? 'running' : ''}`} aria-hidden="true" />
        <span id="status" role="status" title={state.message}>{running ? 'Running' : state.phase === 'ready' ? 'Ready' : error ? 'Stopped' : 'Loading…'}</span>
        <span id="stats" aria-label="Game frame rate"><b>{metrics ? metrics.fps.toFixed(1) : '—'}</b><span>FPS</span></span>
        <div id="debug-metrics" hidden={!debug} aria-label="Debug performance metrics">{debug && <Telemetry metrics={metrics} />}</div>
        <div className="bar-actions">
          <div className="quick-actions" role="group" aria-label="One-slot quick save">
            <button className="quick-button" type="button" aria-label="Quick Save" title={`Quick Save · replaces the single slot on this device. ${quick.message}`} disabled={!running || quick.busy || !quick.available} onClick={() => quickAction(false)}><Icon name="save" /><span>Save</span></button>
            <button className="quick-button" type="button" aria-label="Quick Load" title={`Quick Load · return to your saved moment. ${quick.message}`} disabled={!running || quick.busy || !quick.compatible} onClick={() => quickAction(true)}><Icon name="load" /><span>Load</span></button>
          </div>
          <button className="icon-button" type="button" aria-label="Debug statistics" aria-pressed={debug} title="Debug statistics" onClick={toggleDebug}><Icon name="debug" /></button>
          <button className="icon-button" type="button" aria-label="Player settings" title="Player settings" onClick={() => settings.current.showModal()}><Icon name="settings" /></button>
          <button className="icon-button" id="fullscreen" type="button" aria-label="Fullscreen" title="Fullscreen (F or double-click)"><Icon name="fullscreen" /></button>
        </div>
      </div>
      <div className="quick-notice" role="status" aria-live="polite" aria-atomic="true">{showQuickNotice && <span>{quick.message}</span>}</div>
    </footer>
    <dialog id="settings" aria-labelledby="settings-title" ref={settings} onClick={(event) => { if (event.target === settings.current) settings.current.close(); }}>
      <div className="settings-head"><div><span className="menu-eyebrow">WEB PLAYER / OPTIONS</span><h2 id="settings-title">System configuration</h2></div><button className="icon-button" aria-label="Close settings" onClick={() => settings.current.close()}><Icon name="close" /></button></div>
      <div className="settings-content">
        <label className="setting-row">Resolution<select id="scale" defaultValue="1"><option value="1">1× · 640 × 512</option><option value="2">2× · 1280 × 1024</option><option value="3">3× · 1920 × 1536</option></select></label>
        <label className="setting-row">Aspect ratio<select id="aspect" defaultValue="4:3"><option value="4:3">4:3</option><option value="16:9">16:9</option></select></label>
        <p className="hint">Resolution and aspect changes reload the game.</p>
        <VideoSettings />
        <label className="setting-row">Debug statistics<input type="checkbox" checked={debug} onChange={toggleDebug} /></label>
        <p className="hint">GPU time is a rendering estimate. EMU, VU and GS show thread activity, not system CPU usage. Heap is allocated memory.</p>
        <button id="controls-toggle" className="setting-action" type="button" hidden>Hide controls</button>
        <KeyboardControls />
        <DebugReport player={playerRef} />
        <section className="settings-section"><h3>Memory card</h3><div className="button-row"><button id="export-card" type="button">Export card</button><button id="import-card" type="button">Import card</button></div><p className="hint">Back up or restore an 8 MB PS2 card. Importing replaces slot 1 and reloads the game.</p><input id="import-file" type="file" accept=".ps2" hidden /></section>
        <section className="settings-section"><h3>Downloaded player</h3><p className="hint">{cache}</p><button disabled={cacheBusy} type="button" onClick={async () => { setCacheBusy(true); try { await clearPlayerCache(); setCache('Downloaded player cleared. Reload to download it again. Saves are unchanged.'); } catch { setCache('Could not clear player downloads. Try again.'); } finally { setCacheBusy(false); } }}>{cacheBusy ? 'Clearing…' : 'Clear player cache'}</button></section>
      </div>
    </dialog>
    <div id="overlay" hidden={running}>
      {!running && <BootScene paused={error} />}
      <div id="panel">
        <span className="player-mark" aria-hidden="true">PS2<span> WEB PLAYER</span></span>
        <h1>{error ? 'Player stopped' : state.phase === 'ready' ? 'Ready to play' : 'Getting your game ready'}</h1>
        {!loading && <p className="loading-message" role="status">{error ? state.message : 'Your game runs locally in this browser.'}</p>}
        {loading && <LoadingProgress download={download} starting={state.phase === 'starting'} />}
        <p id="help" hidden />
        <button id="start" className="start-button" type="button" disabled={state.phase !== 'ready'} hidden={error}>{state.phase === 'ready' ? 'Start game' : 'Preparing…'}</button>
        {error && <button className="start-button" onClick={() => location.reload()}>Reload player</button>}
      </div>
    </div>
  </>;
}
