# Proposal

## Why

`updateRoomStatus` ignores what is already scheduled for a room whose meeting is running. `open` sets the
room to `open` with `meetingEndAction` `none` while the meeting goes on: it silently cancels a scheduled
deletion or close, and the periodic reconciliation then finds an `open` room with a live meeting and sends a
second `meetingStarted` for the same meeting. `closed` on a room scheduled for deletion overwrites
`meetingEndAction` `delete` with `close`, so the room survives the meeting it was meant to be deleted after.

## What Changes

- While a meeting is active, `updateRoomStatus` never changes `status`: the room stays `active_meeting`.
- `closed` during a meeting schedules `close` (`202`, as today) but keeps an already scheduled `delete`.
- `open` during a meeting cancels a scheduled `close` and answers `200`; it answers `409` and changes nothing
  when a deletion is scheduled.
- The status write, and the meeting end applying `meetingEndAction`, are conditional on the state they were
  decided from, so a status change and a meeting end handled at once by different replicas never leave an
  idle room with a pending action.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rooms`: "Opening and closing a room" states what `open` and `closed` do while a meeting is active and
  when a deletion is scheduled.

The fix also makes the existing `meetings` requirement "meetingStarted webhook" (sent exactly once per
meeting) hold when a room is reopened during its meeting.

## Impact

- REST API: `updateRoomStatus` (public). The `200` and `202` answers keep their shape; a new `409` answer
  for `open` on a room scheduled for deletion is an additive status code. `status` no longer becomes `open`
  during a meeting. OpenAPI `meet-ce/backend/openapi/rooms/rooms.yaml` and
  `rooms/requests/update-room-status.yaml` describe it.
- Webhooks: no second `meetingStarted` after a reopen during a meeting. No contract change.
- Console UI: none (the close/reopen toggle calls the same operation).
- Embedded API, deployment configuration: none.
- Code: `meet-ce/backend/src/services/room.service.ts` (`updateMeetRoomStatus`),
  `meet-ce/backend/src/services/livekit-webhook.service.ts` (`handleRoomFinished`),
  `meet-ce/backend/src/repositories/room.repository.ts`, `meet-ce/backend/src/models/error.model.ts`.
- openvidu.io: none. `docs/meet/features/rooms/management.md` says managers can close or reopen a room at any
  time, which stays true.

## Decisions to confirm

- `open` on a room scheduled for deletion answers `409` and keeps the deletion. Alternative: answer `200`
  and keep the deletion silently, or cancel the deletion as today.
- `closed` on a room scheduled for deletion answers `202` and keeps `delete`. Alternative: `409`.
- `open` during a meeting with a scheduled close cancels the close and answers `200` (not `202`), since
  nothing is left pending. Alternative: `202`.
