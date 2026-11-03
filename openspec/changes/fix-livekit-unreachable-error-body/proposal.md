# Proposal

## Why

`startRecording` with the media server unreachable answers `503` with the body `LiveKit Error` / "LiveKit is not
available", while the OpenAPI documents a `Recording Error` naming the room. `stopRecording` with the media server
unreachable answers a `500` the OpenAPI does not list.

## What Changes

- `startRecording` answers the documented `Recording Error` body for both media server refusals (no recorder
  available, unreachable).
- The `500` of `stopRecording` for an unreachable media server is documented in the OpenAPI.
- No spec change: `recordings` "Starting a recording through the REST API" states the `503`, not the body.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with the OpenAPI and `recordings` "Starting a recording through the REST API".

## Impact

- REST API: the body of one existing `503` changes to the documented one; the status is unchanged. The OpenAPI gains the `500` of `stopRecording`.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: the start recording path of the recording service and the media server error mapping in `meet-ce/backend`.
- openvidu.io: REST API reference regenerated from the OpenAPI.

## Decisions to confirm

- `stopRecording` with the media server unreachable. Proposed: keep `500` and document it. Alternative: answer `503`, as the start does.

## Source

3.10.0 pre-release audit, finding RC-11 (low, verified-live), introduced by #141.
