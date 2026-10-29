# Proposal

## Why

Before starting a recording, `startRecording` checks that the room has participants connected by
listing them in the media server. That check (`roomHasParticipants`) turns any failure into "no
participants", so when the media server cannot be reached `startRecording` answers `409` ("Room has
no participants") instead of telling the caller the service is unavailable. The `recordings` spec
("Media server does not accept the recording") and the OpenAPI `503` of `startRecording` both
promise `503` for a media server that cannot be reached.

## What Changes

- `startRecording` answers `503` with error `LiveKit Error` ("LiveKit is not available") when the
  media server cannot be reached while checking the room's participants, and creates no recording.
- A room that is not open in the media server keeps answering `409`, as today: only a failure to
  reach the media server changes.
- The stale-recordings clean-up, the other caller of the participants check, skips a recording for
  that run instead of treating its room as empty, so a media server outage never stops a recording.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The scenario "Media server does not accept the recording" of
`recordings` "Starting a recording through the REST API" already promises `503` for a media server
that cannot be reached; the code is brought in line with it. `add-live-broadcast` (#120) rewrites that
requirement, and its rebase keeps the unreachable media server in the scenario.

## Impact

- REST API: `startRecording` (public), `409` becomes `503` in this one case. The OpenAPI already
  lists `503` for it.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: `roomHasParticipants` and its two callers in `meet-ce/backend` (recording start and the
  stale-recordings clean-up).
- openvidu.io: none. The OpenAPI already documents the `503` of `startRecording` for a media server
  that cannot be reached.

## Decisions to confirm

- The `503` reuses `errorLivekitNotAvailable` (`LiveKit Error`, "LiveKit is not available"), the error
  the other media server calls already answer. Alternative: a recording-specific error naming the
  room.
- Implemented before #120 for 3.10.0, on top of the `503` that `main` already answers when the media
  server does not accept the recording; #120 rebases on it.
