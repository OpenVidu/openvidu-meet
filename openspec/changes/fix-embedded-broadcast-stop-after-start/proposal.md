# Proposal

## Why

A host application that sends `broadcastStop` right after `broadcastStart` can have the stop silently
dropped with a console warning while the broadcast goes live anyway. The meeting also briefly shows the
row that was just started as stopped, with a Start button.

## What Changes

- The broadcasts of a start response are applied to the participant's broadcast state as soon as the
  response arrives, so a stop that follows finds them running and the row never falls back to stopped.
- The state change is forward-only, so the signal that arrives later for the same broadcast is a no-op.
- No delta of its own: requirement "Embedded broadcast commands" of `add-live-broadcast` says
  `broadcastStop` stops the running broadcasts; a task adds the scenario for a stop right after a start.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task adds a scenario to the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Embedded API: `broadcastStop` behaves as documented in a window it did not; no contract change.
- Meeting UI: the row of a just-started destination no longer flickers to stopped.
- Code: `BroadcastService.request` in `.../domains/meeting/services/broadcast.service.ts` and
  `embedded-command.service.ts`, in `meet-ce/frontend/projects/shared-meet-components`.
- REST API, webhooks, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- How the dropped stop is avoided. Proposed: apply the start response to the state, which fixes the stop
  and the flicker together. Alternative: delete the client guard and let the server answer `200` with an
  empty list when nothing runs, which fixes the stop only.

## Source

3.10.0 pre-release audit, finding BF-10 (low, static-plausible), introduced by #120.
