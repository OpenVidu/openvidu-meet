# Tasks

## 1. Release the hold before reporting the end

- [x] 1.1 In `finishRecording` and its egress-ended caller (`meet-ce/backend/src/services/recording.service.ts`, lines 696-710) call `releaseRecordingLockIfNoEgress(roomId)` for the end that stores the recording and for the end of a recording that was never stored, not for a repeated end of one already ended, and `await` it before sending `recordingEnded` and the in-meeting signal. A failure to release is logged and never stops the report. Verify with new cases in `meet-ce/backend/tests/unit/services/recording.service.test.ts`: an end of a recording never stored still releases; a repeated end releases nothing; the release precedes the webhook and the signal; the end is reported when the release fails.
- [x] 1.2 Keep the hold wait of `waitForRecordingToStop` in the recordings integration test helpers: the final status is stored before the release, which reads it to tell the ended egress from a running one, so a test polling the status alone can still see the room held. Keep `meet-ce/backend/tests/integration/api/recordings/start-recording.test.ts` and `orphaned-locks-gc.test.ts` passing (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 CHANGELOG: none (the missing release is a regression of the unreleased #127 change, and the ordering has no line of its own).
- [x] 2.2 openvidu.io: none.
