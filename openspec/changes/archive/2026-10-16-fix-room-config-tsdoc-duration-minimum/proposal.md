# Proposal

## Why

The TSDoc of `MeetRoomConfig.maxDurationMinutes` (`meet-ce/typings/src/database/room-config.ts:18`) says the
lowest duration limit is `10` minutes. The server accepts `1` (`room-config` "Meeting limit bounds"), and the
OpenAPI, the console wizard and the 3.9.0 changelog all say 1 to 1440. Integrators reading the typings get a
wrong bound.

## What Changes

- The TSDoc says the lowest limit is `1`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: documentation only. `room-config` "Meeting limit bounds" already states 1 to 1440.

## Impact

- Typings TSDoc of `MeetRoomConfig` (published package `@openvidu-meet/typings`). No type or behavior change.
- REST API, webhooks, embedded API, meeting UI, console UI, deployment configuration: none.
- openvidu.io: none (the embedded API reference is generated from `src/embedded/` only).
