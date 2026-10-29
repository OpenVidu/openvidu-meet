# Tasks

## 1. Stop a recording the media server has forgotten

- [x] 1.1 In the stop path of the recording service, answer the "already stopped" error (`409`) when the media server returns no recording process for the id, instead of "not found"; the existence check of the authorization middleware keeps answering `404` for unknown ids. Verify with a new case in `meet-ce/backend/tests/unit/services/recording.service.test.ts` that mocks the media server returning no process and expects a `409` `OpenViduMeetError`, and no deliberate-stop latch written.
- [x] 1.2 Keep the `404` and `409` cases of `meet-ce/backend/tests/integration/api/recordings/stop-recording.test.ts` passing (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration` of `CHANGELOG.md`: "[`stopRecording`][3.9-stop-recording] answered `404` for a recording that had ended more than 24 hours earlier. It now answers `409`, as for any recording already stopped." Verify the reference `[3.9-stop-recording]` already exists at the end of the file.
- [x] 2.2 openvidu.io: none (the OpenAPI is unchanged, so the REST API reference needs no regeneration).
