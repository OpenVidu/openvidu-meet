# Proposal

## Why

When a meeting ends while a recording is still running, the recording-ended notice is sent to a media server room that no longer exists, and the media server takes about 3 seconds to fail instead of answering "not found". That delay, plus an error-level log with a stack trace, lands inside the webhook handling and delays the media server's webhook delivery; the same cost hits room deletion and the stale-recordings sweep. Release 3.9 skipped these notices in milliseconds.

## What Changes

- The recording notice checks that the media server room exists (a quick listing) before sending, and skips it with a warning when the room is gone.
- The unit test of the media server service models the real answer for a missing room (`unavailable`, `503`), not a `404`.
- No spec change: `recordings` "A recording ends with its meeting" already requires the final status and `recordingEnded` when the meeting ends; this fix keeps that prompt.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `recordings` "A recording ends with its meeting".

## Impact

- Webhooks: `recordingEnded` and other recording webhooks of a recording that ends with its meeting are no longer delayed by about 3 seconds.
- REST API, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: `sendRecordingUpdatedSignal` of `frontend-event.service.ts` and `sendData` of `livekit.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- Where the existence check lives. Proposed: in the recording signal sender only, since reactions and hand signals already proved the meeting exists in the same request. Alternative: restore it inside `sendData` for every caller, at the price of one listing per reaction or hand signal, which the request-path optimization removed.

## Source

3.10.0 pre-release audit, finding TK-1 (medium, verified-live), introduced by #132.
