# Proposal

## Why

A recording start that fails while the media server is unreachable leaves the room marked as recording. After the
media server is back, the room answers `409` "already being recorded" for up to 15 minutes, and rooms that record
automatically stay unrecordable the same time.

## What Changes

- A start that fails before the media server accepted a recording releases the hold it took at once, without asking
  the media server; the media server is consulted only when the start call itself ended with an unknown outcome.
- No spec change: the fix makes the scenario "Start refused by the media server" of `recordings` "One recording in
  progress per room across replicas" and the `503` scenario "Media server does not accept the recording" hold.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `recordings` "One recording in progress per room across replicas".

## Impact

- REST API: `startRecording` answers `201` once the media server is back, as the OpenAPI already says. No contract change.
- Code: the start path and its failure release in the recording service in `meet-ce/backend` (a simpler catch, not a new mechanism).
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- A start call that fails without any answer from the media server. Proposed: release the hold (nothing was created); the stale-recordings clean-up ends any recording that did start. Alternative: keep the hold and let the orphaned-hold clean-up decide, as today.

## Source

3.10.0 pre-release audit, finding RC-10 (medium, verified-live), introduced by #141.
