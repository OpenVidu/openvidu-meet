# Proposal

## Why

`startRecording` checks the target room (it exists, recording is enabled, it does not record
automatically) before checking that the caller holds `recordingControl` in it. A room member token
issued for room A can therefore probe room B: it gets `404` when B does not exist and a "recording is
disabled" or "starts automatically" message when it does, instead of the `403` the `recordings` spec
promises to a token issued for another room.

## What Changes

- `startRecording` checks `recordingControl` in the target room right after authentication and body
  validation, before any check on the room's existence or recording config. A caller without the
  permission gets `403` whatever the target room is.
- An API key (which holds every permission) still gets `404` for an unknown room and `403` for a room
  with recording disabled or with `recording.autoStart` set, as today.
- No spec change: the fix makes the requirement "Starting a recording through the REST API" of
  `recordings` hold, in particular its scenario "Room member token without the permission" for a
  token issued for another room that does not exist or cannot be recorded.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `recordings` "Starting a recording through
the REST API".

## Impact

- REST API: `startRecording` (public). A caller lacking `recordingControl` gets `403` where it got
  `404` for an unknown room; the other answers keep their status, only the message of the `403`
  changes for a room with recording disabled or automatic. The OpenAPI already documents these
  statuses, so the contract does not change.
- Embedded API: `recordingStart` runs only for a participant holding `recordingControl` in its own
  room, so it never meets the changed order.
- Webhooks, meeting UI, console UI, deployment configuration: not affected.
- Code: the middleware order of the start route in `meet-ce/backend`.
- openvidu.io: no page changes.

## Decisions to confirm

- A caller lacking `recordingControl` in a room with recording disabled now gets the generic
  insufficient-permissions `403` instead of the "recording is disabled" `403`. Alternative: keep the
  room-config message for callers that hold a token of that same room.
