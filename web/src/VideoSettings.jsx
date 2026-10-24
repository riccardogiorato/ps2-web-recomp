import React from 'react';

export default function VideoSettings() {
  return <>
    <label className="setting-row">Antialiasing<input id="video-aa" type="checkbox" defaultChecked={false} /></label>
    <p id="video-help" className="hint">Smooths jagged edges. Applies immediately.</p>
  </>;
}
