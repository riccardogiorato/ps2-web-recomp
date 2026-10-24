import React, { memo } from 'react';

const Button = ({ children, name, ...props }) => <button type="button" tabIndex={-1} aria-label={name || children} {...props}>{children}</button>;
const Stick = ({ right = false }) => <div className="stick" data-stick={right ? 'right' : 'left'} aria-label={right ? 'Right analog stick' : 'Left analog stick'}><div className="knob" id={right ? 'right-knob' : 'knob'} /></div>;

function Controls() {
  return <div id="touch" className="controls" aria-label="Touch controller">
    <div className="cluster left">
      <div className="shoulders"><Button className="ctl shoulder" data-btn="256">L2</Button><Button className="ctl shoulder" data-btn="1024">L1</Button></div>
      <div className="dpad" data-dpad aria-label="Directional pad">
        <span className="up" data-dir="16">▴</span><span className="left" data-dir="128">◂</span><span className="hub" /><span className="right" data-dir="32">▸</span><span className="down" data-dir="64">▾</span>
      </div>
      <Stick />
    </div>
    <div className="cluster mid"><Button className="ctl small" data-btn="1">Select</Button><Button className="ctl small" data-btn="8">Start</Button></div>
    <div className="cluster right">
      <div className="shoulders"><Button className="ctl shoulder" data-btn="2048">R1</Button><Button className="ctl shoulder" data-btn="512">R2</Button></div>
      <div className="face">
        <Button name="Triangle" className="ctl tri" data-btn="4096">△</Button><Button name="Square" className="ctl sq" data-btn="32768">□</Button><Button name="Circle" className="ctl ci" data-btn="8192">○</Button><Button name="Cross" className="ctl cr" data-btn="16384">×</Button>
      </div>
      <Stick right />
    </div>
  </div>;
}

export default memo(Controls);
