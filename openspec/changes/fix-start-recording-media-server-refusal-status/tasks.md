# Tasks

## 1. Answer 503 when the media server does not accept the start

- [ ] 1.1 Add a `503` recording error to `meet-ce/backend/src/models/error.model.ts` and raise it from the recording start of the media server client for any media server API error or connection error, keeping the error-level log. Verify with a new case in the "guards that say no" block of `meet-ce/backend/tests/unit/services/recording.service.test.ts`: the media server start rejects, the call rejects with status `503`, and the room's recording hold is released.
- [ ] 1.2 Update the `503` response of `startRecording` in `meet-ce/backend/openapi/recordings/recordings.yaml` (a recording-specific response under `recordings/responses/errors/` saying the media server could not start the recording now) and verify with `pnpm run lint:api` in `meet-ce/backend`.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration` of `CHANGELOG.md`: "[`startRecording`][3.9-start-recording] answered `500` when the media server did not accept the recording or could not be reached. It now answers `503`." Verify the reference `[3.9-start-recording]` already exists.
- [ ] 2.2 openvidu.io: regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` on `next` and verify the `startRecording` `503` description changed; no feature page changes.
