import React from 'react';
import { keyForButton } from './keyboard.js';

export default function KeyboardControls() {
  return <details className="settings-section keyboard-guide"><summary>Keyboard controls</summary>
    <dl>
      {[[14, 'Cross ×'], [13, 'Circle ○'], [15, 'Square □'], [12, 'Triangle △'], [10, 'L1'], [11, 'R1'], [8, 'L2'], [9, 'R2'], [3, 'Start'], [0, 'Select']].map(([bit, label]) => <div key={bit}><dt>{label}</dt><dd><kbd>{keyForButton(bit)}</kbd></dd></div>)}
      <div><dt>D-pad</dt><dd><kbd>↑</kbd> <kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd></dd></div>
      <div><dt>Left stick</dt><dd><kbd>I</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd></dd></div>
      <div><dt>Fullscreen</dt><dd><kbd>F</kbd></dd></div>
    </dl>
    <p className="hint">Click the game to focus it. Left stick: I up, J left, K down, L right. Use a gamepad or touch controls for the right stick.</p>
  </details>;
}
