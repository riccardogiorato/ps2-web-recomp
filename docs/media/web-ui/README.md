# Web player UI comparison

Actual browser captures of Kingdom Hearts II (PAL), taken on 2026-10-24.
The before images use the unmodified HTML shell from upstream commit
`6526f48` with the same compiled game runtime as the new player. Both
interfaces resume the same local state near frame 6000 of the opening
sequence. Desktop and landscape pairs are captured near frame 6050.

- `before-desktop.png` / `after-desktop.png`: desktop, 1280 × 800 CSS viewport.
- `before-landscape.png` / `after-landscape.png`: touch landscape, 844 × 390 CSS viewport.
- `after-portrait.png`: touch portrait, 390 × 844 CSS viewport.
- `settings.png`: settings dialog over the running game.

The capture browser uses the software fallback. These images compare the
interface, not rendering performance. No FPS readings or game frames were
replaced. The images are captures of the running player.

Disc images, game executables and state files are not part of this directory.
