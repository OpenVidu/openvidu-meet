# Proposal

## Why

A participant whose connection drops and returns after the recording ended keeps seeing the recording as in
progress: the REC mark stays on and an embedded host never receives `recordingStatusChanged` with the final
status. A `recordingStop()` from that participant then answers `409`.

## What Changes

- A participant that rejoins or reconnects is told the latest recording state of the meeting even when it is final,
  so the end it missed reaches the meeting and the embedded host once.
- Specs: `recordings` gains the requirement "Recording status after a reconnection".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: adds "Recording status after a reconnection".

## Impact

- Meeting UI and embedded API: the REC mark and `recordingStatusChanged` follow an end that happened during an outage. No contract change: the event already exists and the client already drops repeated states.
- Code: the participant-joined handler of the LiveKit webhook service in `meet-ce/backend`; the meeting events service of `shared-meet-components` only if the client-side option below is chosen.
- REST API, webhooks, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Where the missed end is recovered. Proposed: the server sends the meeting's latest recording state on `participant_joined` even when final (one place, covers every client). Alternative: the client re-reads the room's in-progress recording on `Reconnected`.

## Source

3.10.0 pre-release audit, finding RC-1 (low, static-plausible), introduced by #101.
