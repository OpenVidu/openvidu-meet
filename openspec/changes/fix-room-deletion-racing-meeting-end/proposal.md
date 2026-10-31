# Proposal

## Why

Deleting a room with `withMeeting=when_meeting_ends` while its meeting is ending can answer `202` "deleted when the meeting ends" and leave the room open with a pending deletion. The next meeting held in that room then deletes the room, its members and every recording made during that meeting when it ends. The mirror case deletes an idle room whose meeting has just started.

## What Changes

- The deletion writes are conditioned on the state the decision was made from: scheduling the deletion requires the room to still be `active_meeting`, and closing or deleting an idle room requires it not to be.
- When a condition fails, the deletion is decided again against the room's new state, as `updateRoomStatus` already does. `bulkDeleteRooms` and the automatic deletion of expired rooms share the path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rooms`: new requirement "A deletion follows the meeting state it ends up facing".

## Impact

- REST API: `deleteRoom` and `bulkDeleteRooms` answer according to the state found when they write; no contract change (the statuses and success codes already exist).
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: `deleteMeetRoom` of `room.service.ts` and the conditional writes of `room.repository.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- A scheduled deletion that finds the meeting already ended. Proposed: delete the room immediately as an idle room (the policies for recordings still apply). Alternative: answer `409` and ask the caller to retry.
- An immediate deletion that finds a meeting just started. Proposed: apply `withMeeting` to it (`fail` answers `409`). Alternative: always answer `409`.

## Source

3.10.0 pre-release audit, findings RM-3 and MT-1 (medium, verified-live), introduced by earlier releases.
