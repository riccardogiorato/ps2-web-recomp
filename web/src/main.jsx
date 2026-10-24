import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './player.css';
import './console.css';

createRoot(document.getElementById('root')).render(<App />);

// Recreate the native runtime on edits; never mount a second Wasm instance.
if (import.meta.hot) import.meta.hot.on('vite:beforeUpdate', () => location.reload());
