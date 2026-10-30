# Proposal

## Why

The end of a meeting is processed by two independent paths: the media server's `room_finished` notice and the periodic check that reconciles rooms marked `active_meeting` with the media server. Neither checks that the room is still `active_meeting` before acting, so when both run for the same meeting (the check reads the room while the notice is being processed, or a second replica handles a late copy of the notice after the first one released its webhook lock) the end is processed twice and two `meetingEnded` webhooks are sent.

## What Changes

- Processing the end of a meeting becomes a status transition that only one caller can win: the room leaves `active_meeting` atomically (to `open`, to `closed`, or is deleted, according to its pending end action), and only the caller that made that transition sends `meetingEnded` and runs the end-of-meeting clean-up.
- A room that is no longer `active_meeting` when an end is reported is left alone and no webhook is sent, mirroring the guard `meetingStarted` already has.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `meetings` spec already states the intended behavior; this change makes these scenarios pass:

- `meetings` / Requirement "meetingEnded webhook" / Scenario "The end is reported to two replicas".
- `meetings` / Requirement "Meeting state is reconciled with the media server" / Scenarios "Missed end" and "Check runs once in a cluster" (each inconsistent room handled once, also against a concurrent `room_finished`).

## Impact

- Webhooks: `meetingEnded` is sent once per meeting. No contract change.
- REST API, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Backend: the room-finished handling and the room repository (conditional status update).
- openvidu.io: no page changes.
