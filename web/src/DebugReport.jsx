import React, { useState } from 'react';
import { copyReport } from './diagnostics.js';

export default function DebugReport({ player }) {
  const [message, setMessage] = useState('Copy a report while the game feels laggy, then paste it into this chat.');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  return <section className="settings-section"><h3>Diagnostics</h3>
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const report = player.current.getDiagnostics();
        if (await copyReport(report)) { setManual(''); setMessage('Copied debug info. Paste it into this chat.'); }
        else { setManual(report); setMessage('Clipboard unavailable. Select and copy the report below.'); }
      } catch { setMessage('Could not create the report. Reload the player and try again.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Copying…' : 'Copy debug info'}</button>
    <p className="hint" role="status">{message}</p>
    {manual && <textarea className="debug-report-text" aria-label="Debug report" value={manual} readOnly onFocus={(event) => event.target.select()} />}
  </section>;
}
