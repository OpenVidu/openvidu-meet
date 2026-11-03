# Proposal

## Why

A media server notice about a recording that is processed after the recording ended (a redelivered event, two
replicas or media nodes handling one recording, a slow handler) moves the finished recording back to `ending`. It then
cannot be played or deleted for up to 14 minutes, every participant's recording mark shows "stopping", and the
clean-up ends it again with a second `recordingEnded`.

## What Changes

- A recording update is stored, and `recordingUpdated` and the meeting notice are sent, only while the recording is
  still in progress; an update for a recording that already has a final status is ignored.
- No spec change: the fix makes `recordings` "Recording statuses" (only forward, one final status) and the 3.10.0
  "reported once" guarantee of "Clean-up of stale recordings" hold.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `recordings` "Recording statuses".

## Impact

- Webhooks: no `recordingUpdated` nor second `recordingEnded` for a finished recording. No contract change.
- Meeting UI and embedded API: the recording state no longer goes back to "stopping".
- Code: the egress-updated handler of the LiveKit webhook service and the recording repository update in `meet-ce/backend`.
- REST API, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- None.

## Source

3.10.0 pre-release audit, finding RC-7 (medium, verified-live), introduced by #127.
