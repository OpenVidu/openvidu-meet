# Tasks

## 1. Release the hold on every end and before reporting it

- [x] 1.1 In `finishRecording` and its egress-ended caller (`meet-ce/backend/src/services/recording.service.ts`, lines 696-710) call `releaseRecordingLockIfNoEgress(roomId)` on every egress end, outside the "first caller" branch, and `await` it before sending `recordingEnded` and the in-meeting signal. Verify with new cases in `meet-ce/backend/tests/unit/services/recording.service.test.ts`: an end with no stored in-progress recording still releases; the release is awaited before the webhook is dispatched.
- [x] 1.2 Remove the extra wait of `waitForRecordingToStop` in the recordings integration test helpers now that the ordering holds, and keep `meet-ce/backend/tests/integration/api/recordings/start-recording.test.ts` and `orphaned-locks-gc.test.ts` passing (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 CHANGELOG: none (the missing release is a regression of the unreleased #127 change, and the ordering has no line of its own).
- [x] 2.2 openvidu.io: none.
