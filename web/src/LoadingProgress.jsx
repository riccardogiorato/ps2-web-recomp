import React from 'react';
import { downloadView } from './download.js';

export default function LoadingProgress({ download, starting }) {
  const view = downloadView(download || { message: 'Preparing player…' });
  return <div className="download-panel" aria-label="Player preparation">
    <div className="download-heading"><span>{starting ? 'Starting game' : view.label}</span><strong>{view.percent == null ? 'Please wait' : `${view.percent}%`}</strong></div>
    <progress aria-label="Player file preparation" {...(view.fraction == null ? {} : { value: view.fraction, max: 1 })} />
    <div className="download-detail"><span>{view.size || (starting ? 'Opening your game…' : 'Checking player files…')}</span>{view.remaining != null && <span>{view.remaining === 0 ? 'Files ready' : `${view.remaining}% left`}</span>}</div>
    <p className="hint">{starting ? 'Your session will begin shortly.' : 'Player files stay on this device for next time. The game disc streams separately.'}</p>
  </div>;
}
