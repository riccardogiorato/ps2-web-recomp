import React, { memo, useEffect, useState } from 'react';
import './boot.css';

// Original CSS geometry: no images, textures, or additional graphics context.
const blocks = [
  [12, 23, 32, 2], [25, 12, 22, 6], [47, 7, 24, 10], [69, 16, 36, 4],
  [85, 30, 27, 13], [94, 55, 42, 7], [78, 72, 31, 1], [63, 88, 24, 9],
  [36, 85, 40, 5], [14, 73, 28, 12], [4, 48, 38, 3], [29, 34, 16, 8],
  [74, 43, 19, 11], [55, 24, 13, 14], [24, 62, 18, 15], [53, 76, 16, 0],
];

export default memo(function BootScene({ paused }) {
  const [background, setBackground] = useState(() => document.hidden);
  useEffect(() => {
    const onVisibility = () => setBackground(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return <div className={`boot-scene${paused || background ? ' boot-paused' : ''}`} aria-hidden="true">
    <div className="boot-haze" />
    <div className="boot-field">
      {blocks.map(([x, y, size, delay], index) => <div key={index} className="boot-drift" style={{
        left: `${x}%`, top: `${y}%`, '--size': `${size}px`, '--delay': `${-delay}s`,
        '--turn': `${index * 37}deg`, '--duration': `${18 + index % 5 * 3}s`,
      }}><div className="boot-cube">{['front', 'back', 'left', 'right', 'top', 'bottom'].map((face) => <i key={face} className={`boot-face boot-${face}`} />)}</div></div>)}
    </div>
    <div className="boot-vignette" />
  </div>;
});
