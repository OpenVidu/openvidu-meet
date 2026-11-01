# Proposal

## Why

A developer who runs `./meet.sh dev --webcomponent` gets no bundle watcher and a stale bundle with no
message, because the flag is accepted and ignored. The webcomponent developer guide also still says that
`pnpm run dev` starts the testapp, which it no longer does.

## What Changes

- `./meet.sh dev` rejects unknown flags, and tells that the bundle watcher is part of `--testapp`.
- The line about `pnpm run dev` in the webcomponent developer guide is corrected.
- Tooling and documentation only: no behavior of the product changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Tooling change, outside the specs.

## Impact

- Deployment configuration, REST API, webhooks, embedded API, meeting UI, console UI: not affected.
- Code: the `dev()` function of `scripts/dev/dev.sh` and `meet-ce/frontend/webcomponent/CLAUDE.md`.
- openvidu.io: none.

## Decisions to confirm

- What `--webcomponent` does. Proposed: an error naming `--testapp`. Alternative: a warning, then the
  same as `--testapp`.

## Source

3.10.0 pre-release audit, finding EM-12 (low, static-high), introduced by 46d023435.
