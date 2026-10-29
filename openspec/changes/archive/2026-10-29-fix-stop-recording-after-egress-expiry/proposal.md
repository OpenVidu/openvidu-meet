# Proposal

## Why

`stopRecording` decides whether a recording can be stopped by asking the media server for its
recording process. The media server forgets an ended process after about 24 hours, so a stop sent
later for a recording that exists and has long ended answers `404` instead of `409`, while the
OpenAPI and the `recordings` spec promise `409` for any recording already ended.

## What Changes

- `stopRecording` answers `409` (already stopped) for a stored recording whose recording process
  the media server no longer knows, whatever its age. `404` stays for an id that matches no stored
  recording, which the authorization step already answers before the stop runs.
- No spec change: the fix makes the requirement "Stopping a recording" of `recordings` hold
  (`409` for one already ended, `404` for an unknown one), in particular its scenario "Recording
  already stopped" for a recording stopped more than 24 hours earlier.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `recordings` "Stopping a recording".

## Impact

- REST API: `stopRecording` (public). The status code moves from `404` to the documented `409` in
  this one case; the OpenAPI already lists `409` for an ended recording, so the contract does not
  change.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: the stop path of the recording service in `meet-ce/backend`.
- openvidu.io: no page changes (the REST API reference already documents `409`).

## Decisions to confirm

- A stored recording unknown to the media server is reported as already stopped (`409`), even when
  it is still stored as `active` because its process was lost; the stale-recordings clean-up then
  marks it `aborted`. Alternative: `404` for that case, as today.
