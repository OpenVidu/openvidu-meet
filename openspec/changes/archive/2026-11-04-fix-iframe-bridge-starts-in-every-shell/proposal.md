# Proposal

## Why

The iframe bridge that posts embedded events and accepts commands starts only from a line in the CE
application shell's own configuration. Any other application shell built on the shared library must repeat
that line by hand, and without it an iframe posts no events and accepts no commands, with no warning.

## What Changes

- The library offers one provider that starts the bridge, used by the CE shell, so every application shell
  built on the library gets the bridge by adding a single provider (or by default).
- No spec change: "Iframe events are messages to the containing page" and "Iframe commands are accepted
  only from the containing page" already require the behavior in every iframe.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `embedded-api` "Iframe events are messages to
the containing page".

## Impact

- Embedded API: no contract change.
- Not affected: REST API, webhooks, meeting UI, console UI, deployment configuration.
- Code: a new exported provider in `shared-meet-components` (for example `provideEmbeddedIframeBridge()`)
  and the CE shell's `app.config.ts`. This is a CE extension seam: application shells built on the library
  reuse it instead of repeating the initializer.
- openvidu.io: none.

## Decisions to confirm

- How the library starts the bridge. Proposed: an exported provider that every shell lists. Alternative:
  the library starts the bridge by itself when the application bootstraps, with no shell wiring.

## Source

3.10.0 pre-release audit, finding EM-10 (low, static-high), introduced by #135.
