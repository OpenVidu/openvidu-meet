# Tasks

## 1. One finishing path for final statuses

- [ ] 1.1 Add to the recording repository a conditional update that stores a final recording only while its stored status is `starting`, `active` or `ending`, returning whether it matched. Verify with a unit case in `meet-ce/backend/tests/unit/services/recording.service.test.ts` (or the repository's existing unit file) that a second call for the same recording does not match.
- [ ] 1.2 Add the recording-service finishing operation (conditional store, then `recordingEnded`, in-meeting signal and hold release only when it matched) and route the media server end notification in `livekit-webhook.service.ts` through it. Verify the existing recording webhook and auto-start suites under `meet-ce/backend/tests/integration/api/recordings/` still pass, and add a unit case that a second end for the same recording sends no webhook.
- [ ] 1.3 Route the room deletion's stop fallback in `recording.service.ts` through the finishing operation. Verify the room deletion suites with `withRecordings` still pass.

## 2. Clean-up reports the ends it finds

- [ ] 2.1 In `recording-scheduled-tasks.service.ts`, for a recording whose process is not in progress, fetch the process by id and finish the recording with its reported final status, or `aborted` when unknown. Verify in `meet-ce/backend/tests/integration/api/recordings/stale-recordings-gc.test.ts` that a lost recording ends `aborted` with one `recordingEnded` and a recording-updated signal, and that an ended process keeps its reported status.
- [ ] 2.2 For a stale process that still exists, only stop it. Update the two "should abort recording if room ... stale" cases of the same file to expect the stop and no direct `aborted` write.
- [ ] 2.3 Verify the meeting side with a case in `meet-ce/frontend/e2e/recordings.test.ts` only if the local deployment can lose a recording process on demand; otherwise rely on the signal assertion of 2.1 (Playwright needs the OpenVidu local deployment; report as not run when unavailable).

## 3. Release surfaces

- [ ] 3.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration` of `CHANGELOG.md`: "A recording ended by the stale-recordings clean-up sent no [`recordingEnded`][3.9-recording-ended] webhook and stayed in progress in the meeting and for the embedded event `recordingStatusChanged`. Its end is now reported like any other, once." Add the reference `[3.9-recording-ended]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/recordingEndedWebhook` to the definitions at the end of the file.
- [ ] 3.2 openvidu.io: none.
