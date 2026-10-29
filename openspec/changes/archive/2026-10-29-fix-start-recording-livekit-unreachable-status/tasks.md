# Tasks

## 1. Tell an unreachable media server from an empty room

- [x] 1.1 In `meet-ce/backend/src/services/livekit.service.ts`, make the participants check report "no participants" only for a room the media server does not know (`404` / `not_found`) and throw `errorLivekitNotAvailable` when the media server cannot be reached (connection refused, timeout or `5xx`). Verify with unit cases in `meet-ce/backend/tests/unit/services/livekit.service.test.ts` for the three outcomes.
- [x] 1.2 Check that `startRecording` then answers `503` with error `LiveKit Error` and creates no recording, and that the stale-recordings clean-up logs and skips the recording for that run. Verify with a case in `meet-ce/backend/tests/integration/api/recordings/start-recording.test.ts` that mocks the participants listing failing to connect, and with the existing cases of `stale-recordings-gc.test.ts` (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration` of `CHANGELOG.md`: "[`startRecording`][3.9-start-recording] answered `409` (no participants) when the media server could not be reached. It now answers `503`." If the line of the `503` reconciliation already covers `startRecording`, fold this case into it instead of adding a second line.
- [x] 2.2 openvidu.io: none (the REST API reference already documents the `503`).
