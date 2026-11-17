# Tasks

## 1. Typings and contract

- [x] 1.1 In `meet-ce/typings/src/embedded/events.ts`, replace `RECORDING_STATUS_CHANGED` with `RECORDING_STARTED`, `RECORDING_UPDATED` and `RECORDING_ENDED` (`recordingStarted`, `recordingUpdated`, `recordingEnded`), each with its TSDoc, its `MeetRecordingInfo` entry in `EmbeddedEventPayloads` and its event message type in the `EmbeddedEvent` union, worded like the broadcast ones; delete `EmbeddedRecordingStatusChangedEvent`. Verify with `./meet.sh build-typings`.
- [x] 1.2 Name the new events in the TSDoc of `recordingStart` in `meet-ce/typings/src/embedded/commands.ts`. Verify that `grep -rn recordingStatusChanged meet-ce/typings` finds nothing.
- [x] 1.3 Update the frozen event list of `meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts`. Verify with `./meet.sh test-unit-backend`.
- [x] 1.4 Name the three events in the `## Purpose` of `openspec/specs/recordings/spec.md`, and `recordingEnded` in the proposal and the delta spec of the open change `fix-recording-indicator-after-reconnect`. Verify with `./meet.sh verify --only openspec --all`.

## 2. Embedded events in the library, the shells and the testapp

- [x] 2.1 In `MeetingEventHandlerService` (`shared-meet-components`), report a recording through the step that names a broadcast's event, as `design.md` describes: one shared rule, a ledger holding the recording, the recordings in progress told as `recordingStarted` on `meetingJoined`, and the recording's own status table and notify method removed. Cover it in `meeting-event-handler.service.spec.ts`: start, update and end in order, a repeat and an older report dropped, a repeat with the same content in a different field order dropped, the report before `meetingJoined` told once after it, nothing outside embedded modes. Verify with `./meet.sh test-unit-frontend`.
- [x] 2.2 Update the relay case of `iframe-bridge.service.spec.ts` to one of the new events. Verify with `./meet.sh test-unit-frontend`.
- [x] 2.3 In the webcomponent (`meet-ce/frontend/webcomponent/src/app/app.ts`), replace the `recordingStatusChanged` output with `recordingStarted`, `recordingUpdated` and `recordingEnded`, and describe them in `meet-ce/frontend/webcomponent/CLAUDE.md` next to the broadcast ones. Verify with `./meet.sh test-unit-webcomponent` and `./meet.sh lint-webcomponent`.
- [x] 2.4 Bind the three events in `testapp/src/app/app.html` in place of `recordingStatusChanged`. Verify that the testapp builds and that its event log shows them during a recording.
- [x] 2.5 Update the webcomponent e2e suite (`tests/helpers/testapp.helper.ts`, `tests/e2e/events.test.ts`, `tests/e2e/commands.test.ts`) to the scenarios of the `recordings` delta spec: the trio for a participant who did not start the recording, one `recordingStarted` with `active` after `meetingJoined` for a late joiner, `recordingEnded` for a stop right after a start, no `recordingStarted` without `recordingControl`. Verify with `./meet.sh test-e2e-webcomponent` on an isolated stack, or report it as not run when `./meet.sh doctor` says the local deployment is not usable.
- [x] 2.6 Run `./meet.sh verify` and the suites it lists as selected. Verify that `grep -rn "recordingStatusChanged\|RECORDING_STATUS_CHANGED" meet-ce testapp` finds nothing.

## 3. Release surfaces

- [x] 3.1 In `CHANGELOG.md`, name `recordingStarted`, `recordingUpdated` and `recordingEnded` in the 3.10.0 entry of the embedded recording commands, and `recordingEnded` in the fix of the stale-recordings clean-up that mentions the old event. No new line: the feature is unreleased (`.claude/rules/changelog.md`). Verify that `grep -n recordingStatusChanged CHANGELOG.md` finds nothing.
- [x] 3.2 On openvidu.io `next`, name the three events in `docs/meet/features/recordings/management.md`. Verify that `grep -rn recordingStatusChanged docs/meet` finds nothing there.
- [x] 3.3 Regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet`. Verify that `shared/meet/webcomponent/events.md` lists the three events with the recording as payload and that `commands.md` names them under `recordingStart`.

## Workflow follow-up

- Archive the change inside its pull request once every task is done, then run `./meet.sh verify --only openspec --all`.
