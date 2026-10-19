# Proposal

## Why

Two texts describe recordings behavior that the server does not have:

- The OpenAPI `Range` parameter of `getRecordingMedia` and `downloadRecording` says `bytes=N-`
  returns the file from byte N to its end. The server returns at most 5 MiB from byte N (a `206`
  whose `Content-Range` gives the real end), as players expect.
- A comment in the frontend e2e recordings suite says a `startRecording` request is only answered
  once the recording starts or gives up. The server answers `201` as soon as the media server accepts
  the recording, in the `starting` status, so the comment and the swallowed pending promise around it
  describe the old behavior. Next to it, the `stopStartingRecording` helper says the stop of a
  `starting` recording answers `409`, while it answers `202` and the recording ends `aborted`.

## What Changes

- `meet-ce/backend/openapi/recordings/parameters/recording-range.yaml`: an open-ended range returns
  at most 5 MiB starting at `start`, and the `Content-Range` header tells the end actually served.
- `meet-ce/frontend/e2e/recordings.test.ts`: the stale comment goes, and the start request is awaited
  like any other call. The comment of `stopStartingRecording` in
  `meet-ce/frontend/e2e/helpers/meet-api.helper.ts` states the `202`.
- `meet-ce/backend/tests/integration/api/recordings/stop-recording.test.ts`: the case titled "should
  return 404 when recordingId is not in the correct format" asserts `422`; its title says so.
- The status codes of `startRecording` and `stopRecording` are corrected in the OpenAPI by the
  changes that fix them (`fix-start-recording-media-server-refusal-status`,
  `fix-stop-recording-after-egress-expiry`), not here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Documentation and test wording only; the `recordings` spec already says
`bytes=start-` is served as `206` with its `Content-Range`, without promising the rest of the file.

## Impact

- REST API: OpenAPI description of the `Range` header only; no behavior or schema change.
- Tests: two e2e comments, the start requests of one e2e suite and one integration test title.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: the REST API reference is regenerated from the OpenAPI; no feature page changes.
