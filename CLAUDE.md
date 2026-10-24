# Project instructions

## Preserve T3 Code remote access

These rules apply to every agent and every session in this repository. A previous
KH2 exposure replaced the shared Tailscale root route and broke T3 Code remote
sessions from the MacBook and other devices. Do not repeat that change.

The shared domain is `https://coolmaster-omarchy.tail031b23.ts.net`.
Its intended routes are:

| Path | Destination | Owner |
| --- | --- | --- |
| `/` | `http://127.0.0.1:3773` | T3 Code (`t3 serve`); do not touch |
| `/kh2` | `http://127.0.0.1:8620` | KH2 game server |

- Port **3773 belongs exclusively to T3 Code**. Never bind a game server or
  anything else to it. Never repoint the Tailscale `/` route away from
  `http://127.0.0.1:3773`.
- Port **8620 is for the KH2 game server only**. Expose the game only under the
  explicit `/kh2` prefix, never at `/`.
- A permitted exposure command is `tailscale serve --set-path /kh2 8620`, or an
  equivalent form scoped specifically to `/kh2`. Never run bare
  `tailscale serve 8620`: it replaces the root handler.
- **Never run `tailscale serve reset` or overwrite the root handler.** Do not
  change tailnet routing ports as part of routine game-server or UI work.
- If 8620 is occupied or another game-server port is necessary, select a new
  available port and change only the `/kh2` mapping. Never reuse or probe ports
  belonging to other services: **3773 = T3 Code; 8080 = strata server**.
- After any authorized routing change, run `tailscale serve status` and verify
  that `/` still points to `http://127.0.0.1:3773`. Check:

  ```sh
  curl --silent --show-error --include https://coolmaster-omarchy.tail031b23.ts.net/.well-known/t3/environment
  ```

  The response must be **HTTP 200 with JSON** from T3 Code. A 404 or 502 means
  remote access is broken. Immediately revert the routing change you just made
  and tell Riccardo; never use a reset or replace the root handler to recover.
