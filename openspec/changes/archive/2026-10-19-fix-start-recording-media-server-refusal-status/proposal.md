# Proposal

## Why

When the media server does not accept a new recording (no recorder available, recorder out of CPU,
memory or disk, recorder shutting down) or cannot be reached, `startRecording` answers `500`, which
reads as a bug in Meet. The OpenAPI already lists `503` for this operation, and the condition is
temporary: the same call succeeds once the media server accepts recordings again.

## What Changes

- `startRecording` answers `503` when the media server refuses or cannot be reached while starting
  the recording, with no recording created and the room recordable again, as today.
- Any other unexpected failure keeps answering `500`.
- The `recordings` spec states the `503` in "Starting a recording through the REST API".
- The OpenAPI `503` response of `startRecording` describes the refusal by the media server.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: "Starting a recording through the REST API" adds the `503` answer.

## Impact

- REST API: `startRecording` (public) answers `503` instead of `500` in this case. The OpenAPI
  already declared `503`, so the contract does not change; only its description is refined.
- Embedded API: the `recordingStart` command calls the same endpoint; it already treats any failed
  start as a refused one (no `recordingStatusChanged`), so nothing changes for the host.
- Meeting UI: the start control already shows a generic failure for any error status.
- Webhooks, console UI, deployment configuration: not affected.
- Code: the media server client and the start path of the recording service in `meet-ce/backend`.
- openvidu.io: the REST API reference is regenerated from the OpenAPI; no feature page changes.

## Decisions to confirm

- Every failure of the media server to accept the start answers `503`, whatever reason it gives.
  Alternative: `503` only for capacity reasons (no recorder, CPU, memory, disk) and `500` for the rest.
- The `503` body uses the existing `Recording Error` type with a message naming the room. Alternative:
  reuse the `LiveKit Error` body of an unreachable media server for every case.
