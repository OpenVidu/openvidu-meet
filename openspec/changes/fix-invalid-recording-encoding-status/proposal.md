# Proposal

## Why

A recording encoding the media server cannot use, such as an odd width or a depth of 32, is accepted when a room is
saved and when a recording is started. The start is then refused as a temporary media server failure (`503`, which the
OpenAPI tells integrators to retry), so a room with such an encoding can never record, and its auto-start logs an
error at every join.

## What Changes

- The room `recording.encoding` and the `config.encoding` of `startRecording` accept only values the media server
  accepts (whole width and height, even and at least 16; audio and video depth in the accepted set) and answer
  `422` otherwise.
- A start the media server still rejects as an invalid request answers `422`; `503` stays for a media server that is
  unavailable, out of capacity or unreachable.
- No spec change: the fix makes `room-config` "Recording encoding" (a valid value, `422` otherwise) and `recordings`
  "Recording layout and encoding" hold for these values.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `room-config` "Recording encoding".

## Impact

- REST API: `createRoom`, `updateRoomConfig`, `updateRoom` configuration and `startRecording` answer `422` for those encodings, as the OpenAPI already promises for invalid values; the OpenAPI schema gains the numeric constraints. Values that never worked stop being accepted: no valid request changes.
- Typings: TSDoc of the encoding fields states the constraints.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: the encoding schema in `meet-ce/backend`, the room composite start in the LiveKit service.
- openvidu.io: REST API reference regenerated from the OpenAPI.

## Decisions to confirm

- Rooms already stored with an invalid encoding. Proposed: no migration; their start answers `422`, which tells the integrator to fix the room. Alternative: a forward-only migration resetting the encoding to `H264_720P_30`.

## Source

3.10.0 pre-release audit, finding RC-4 (medium, verified-live), introduced by #125.
