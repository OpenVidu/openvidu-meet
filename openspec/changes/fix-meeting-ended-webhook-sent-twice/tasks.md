# Tasks

## 1. Single owner of a meeting's end

- [ ] 1.1 Add to the room repository a conditional finish that applies the pending `meetingEndAction` (delete, close, reopen) only while the room is `active_meeting` and returns whether it matched; verify with a unit test in `meet-ce/backend/tests/unit/services/livekit-webhook.service.test.ts` that a second call for the same room matches nothing.
- [ ] 1.2 Make `handleRoomFinished` send `meetingEnded` and run the end-of-meeting clean-up only when the conditional finish matched; verify in `livekit-webhook.service.test.ts` that two concurrent calls send one webhook and that a call for an `open` or `closed` room sends none.
- [ ] 1.3 Verify in `meet-ce/backend/tests/unit/services/room-scheduled-tasks.service.test.ts` that the reconciliation of a room whose `room_finished` is processed at the same time results in one `meetingEnded`.
- [ ] 1.4 Run the webhook integration suite (`meet-ce/backend/tests/integration/webhooks/webhook.test.ts`) and check that ending a meeting still delivers exactly one `meetingEnded`; report it as not run if the local deployment is unavailable.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "- The [`meetingEnded`][3.9-meeting-ended] webhook could be sent twice for one meeting when the media server's notice of its end and the periodic meeting status check handled it at the same time. It is now sent once."
- [ ] 2.2 openvidu.io: none.
