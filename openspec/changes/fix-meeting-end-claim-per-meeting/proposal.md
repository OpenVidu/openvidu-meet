# Proposal

## Why

The end of a meeting is claimed through the room's status, not through the meeting that ended. When the media server reports a new meeting before the end of the previous one (several media nodes, two queues), the new meeting is ignored as stale and the old end reopens the room: the new meeting gets no `meetingStarted` and no `meetingEnded`, and the room reads `open` while it runs. When a start was never processed, the end skips the cleanup of names and presence it used to do, and the reconciliation task can end a meeting that started a moment earlier.

## What Changes

- The room remembers which media server meeting is active; an end is claimed only for that meeting.
- A start reported while another meeting is still recorded ends the recorded one and starts the new one.
- The end of a meeting whose start was never processed still releases its name reservations and cleanup state.
- The reconciliation task ends only the meeting it saw as active.
- Persisted field and replicas behavior in `design.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meetings`: new requirement "Each meeting is started and ended on its own", next to "meetingEnded webhook" and "Meeting state is reconciled with the media server".

## Impact

- Webhooks: `meetingStarted` and `meetingEnded` are sent once per meeting in the out-of-order case, as the spec already promises.
- REST API, embedded API, meeting UI, console UI: not affected (the room status is correct while the new meeting runs).
- Deployment: one optional field on the room document, absent for idle rooms.
- Code: `activateMeeting` and `finishMeeting` of `room.repository.ts`, `handleRoomStarted` and `handleRoomFinished` of `livekit-webhook.service.ts` and the reconcile task of `room-scheduled-tasks.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- Where the active meeting is stored. Proposed: on the room document, so the claim stays one conditional update. Alternative: a Redis key per room (lost on a Redis flush, and a second store for the claim).
- Migration. Proposed: none, because the field is set only while the room is `active_meeting` and a missing value means "meeting unknown, claim by status as today"; no mixed-version deployments exist. Alternative: a migration v8 to v9 clearing it (needs a schema version bump and a refreshed `MIGRATION_REV`).

## Source

3.10.0 pre-release audit, finding MT-2 (low, verified-live for a and b, static-plausible for c), introduced by #133.
