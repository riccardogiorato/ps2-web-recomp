# Agent instructions

Read and follow [CLAUDE.md](CLAUDE.md) before working in this repository. It
contains mandatory rules protecting T3 Code remote access across sessions.

In particular: never bind to port 3773, never change the Tailscale root handler,
and never run `tailscale serve reset`. T3 owns `/` → `127.0.0.1:3773`; the KH2 game
server uses port 8620 and may be exposed only under `/kh2`. Port 8080 belongs to
strata. Do not change tailnet routing for routine development.
