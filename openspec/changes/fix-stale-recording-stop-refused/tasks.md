# Tasks

## 1. End a recording whose stop is refused

- [ ] 1.1 In the stale-recordings clean-up (`meet-ce/backend/src/services/recording-scheduled-tasks.service.ts`, line 313), when `stopEgress` fails for an egress that is not `STARTING` or `ACTIVE`, end the recording through `finishLostRecording`; keep the current behavior (retry at the next run) for an egress that is still starting or active. Verify with new cases in the existing unit tests of that service under `meet-ce/backend/tests/unit/services/`, mocking the media server's refusal.
- [ ] 1.2 Keep `meet-ce/backend/tests/integration/api/recordings/stale-recordings-gc.test.ts` passing (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: none (a regression of the unreleased #127 change; 3.9 marked the recording `aborted`).
- [ ] 2.2 openvidu.io: none.
