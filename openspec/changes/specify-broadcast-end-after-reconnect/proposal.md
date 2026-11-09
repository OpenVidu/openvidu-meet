# Proposal

## Why

When a live broadcast ends while a participant's connection is down, the meeting only learns afterwards
that it is gone, and reports it as completed normally, with an end time made up by the browser, even when
it actually failed: the host's `broadcastEnded` contradicts the `broadcastEnded` webhook and carries no
error, and the moderator's activity goes quiet as if it had been stopped. When the meeting itself ends,
no participant's host receives `broadcastEnded` at all, although the embedded API promises it to every
participant whenever a broadcast of the meeting ends.

## What Changes

Depending on the two decisions below:

- A broadcast end missed while disconnected. Either (option A) the meeting reports it as `aborted`,
  without an end date or duration it cannot know, and the TSDoc of `broadcastEnded` says that an end
  missed while disconnected is reported that way; or (option B) the server keeps the final state of each
  ended broadcast until the meeting ends, so the catch-up after a reconnect reports the real status,
  dates and error, and the activity shows a failure as a failure.
- The meeting's end. Either (option A) the TSDoc of `broadcastEnded` says that broadcasts ending with
  the meeting are reported to the host through `meetingLeft` only, and to integrators through the
  `broadcastEnded` webhook; or (option B) the server ends the broadcasts before it closes the room when a
  meeting is ended on purpose (`meetingEnd`, the duration limit, a forced room deletion), so every
  participant still connected receives `broadcastEnded` with the real final status.
- In every case the server's `broadcastEnded` webhook keeps reporting the real end, as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Once decided, a task updates the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Embedded API: the meaning of `broadcastEnded` after a reconnect and at the meeting's end; its TSDoc
  changes in both options, its payload type does not. The embedded API contract test is unaffected (no
  command or event is added or removed).
- REST API: option B of the first question keeps ended broadcasts in `broadcastList` and `broadcastGet`
  until the meeting ends, which changes the requirement "Reading broadcasts" (also touched by
  `fix-broadcast-resync-without-meeting-read`).
- Meeting UI: the Live broadcast activity after a reconnect (option B shows a missed failure).
- Webhooks, console UI, deployment configuration: not affected.
- Code: `settleBroadcast` (`.../openvidu-components/models/broadcast.model.ts`) and `onRoomReconnected`
  (`meeting-event-handler.service.ts`) in the frontend; for the B options, `BroadcastService` and
  `BroadcastStateService` of `meet-ce/backend/src/services/` and the paths that close a meeting's room.
- openvidu.io: the regenerated embedded API reference, and the embedded section of
  `docs/meet/features/meetings/live-broadcast.md` when the behavior at the meeting's end changes.

## Decisions to confirm

- Open product question (audit question 9, first half): how a broadcast end missed during a reconnect
  is reported. Option A: as `aborted` without dates, documented as an end whose outcome the participant
  could not learn. Option B: the server keeps the final state of ended broadcasts until the meeting ends,
  so the catch-up reports the real one.
- Open product question (audit question 9, second half): `broadcastEnded` when the meeting ends. Option
  A: not sent; the TSDoc says the meeting's end is told by `meetingLeft` and by the webhook. Option B: the
  server ends the broadcasts before closing the room, so connected participants receive it with the real
  status.

## Source

3.10.0 pre-release audit, finding BF-7 (low, static-high), introduced by #120.
