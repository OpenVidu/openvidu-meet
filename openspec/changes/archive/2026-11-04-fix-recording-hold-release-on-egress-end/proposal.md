# Proposal

## Why

When the media server reports the end of a recording and Meet finds no in-progress recording stored for it, the room
stays marked as recording, so `startRecording` answers `409` and auto-start is skipped for up to 15 minutes. Even in
the normal case, `recordingEnded` and the meeting notice go out before the room can be recorded again, so a client that
starts a recording as soon as it hears the end can get `409`.

## What Changes

- Every end reported by the media server releases the room's recording hold (the release is idempotent and checks the
  media server), whether or not it ended a stored in-progress recording.
- `recordingEnded` and the in-meeting end notice are sent after that release.
- Specs: `recordings` gains the requirement "A recording's end frees the room before it is reported". The test helper
  that waits for the hold before restarting becomes unnecessary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: adds "A recording's end frees the room before it is reported".

## Impact

- REST API and webhooks: `startRecording` right after `recordingEnded` is accepted; no contract change.
- Embedded API: `recordingStart()` on `recordingStatusChanged` with a final status is accepted.
- Code: the recording finish path of the recording service in `meet-ce/backend`; the wait helper in the recordings integration tests.
- Meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- None.

## Source

3.10.0 pre-release audit, findings RC-8 (low, static-high) and RC-12 (low, static-high), introduced by #127 and by an integration test change (03644787a).
