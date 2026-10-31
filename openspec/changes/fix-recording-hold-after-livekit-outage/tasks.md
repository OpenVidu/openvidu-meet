# Tasks

## 1. Release the hold without asking an unreachable media server

- [ ] 1.1 In the start path of `meet-ce/backend/src/services/recording.service.ts` (lines 114-124 and 791-808) release the lock this request acquired directly when the failure happened before the media server returned, and call `releaseRecordingLockIfNoEgress` only when the start call itself failed with an unknown outcome. Verify with new cases in `meet-ce/backend/tests/unit/services/recording.service.test.ts`: a participants lookup failing with the media server unreachable leaves no hold; a start call that failed in an unknown way still consults the media server.
- [ ] 1.2 Keep `meet-ce/backend/tests/integration/api/recordings/start-recording.test.ts` and `orphaned-locks-gc.test.ts` passing (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: none (it makes the existing 3.10.0 line about `startRecording` answering `503` true: the room is recordable again).
- [ ] 2.2 openvidu.io: none.
