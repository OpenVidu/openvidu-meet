# Tasks

## 1. Single owner of a meeting's end

- [x] 1.1 Add to the room repository a conditional finish that applies the pending `meetingEndAction` (delete, close, reopen) only while the room is `active_meeting` and returns whether it matched; verify with a unit test in `meet-ce/backend/tests/unit/services/livekit-webhook.service.test.ts` that a second call for the same room matches nothing. Done as `RoomRepository.finishMeeting`, whose write is also conditioned on the action it applies, so an action changed meanwhile is read again instead of overwritten. The unit test drives the handler against a double of that contract; the conditional write itself is verified on MongoDB in 1.3.
- [x] 1.2 Make `handleRoomFinished` send `meetingEnded` and run the end-of-meeting clean-up only when the conditional finish matched; verify in `livekit-webhook.service.test.ts` that two concurrent calls send one webhook and that a call for an `open` or `closed` room sends none.
- [x] 1.3 Verify in `meet-ce/backend/tests/unit/services/room-scheduled-tasks.service.test.ts` that the reconciliation of a room whose `room_finished` is processed at the same time results in one `meetingEnded`. Moved to the integration suite `meet-ce/backend/tests/integration/api/rooms/active-status-rooms-gc.test.ts`: the guarantee lives in MongoDB's conditional write, which a unit test with doubles cannot exercise. The test runs the check and two `room_finished` handlings at once; it sends 3 `meetingEnded` before the fix and 1 after.
- [x] 1.4 Run the webhook integration suite (`meet-ce/backend/tests/integration/webhooks/webhook.test.ts`) and check that ending a meeting still delivers exactly one `meetingEnded`; report it as not run if the local deployment is unavailable. Run locally: 63/63, and the rooms and meetings suites 409/409.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "- The [`meetingEnded`][3.9-meeting-ended] webhook could be sent twice for one meeting when the media server's notice of its end and the periodic meeting status check handled it at the same time. It is now sent once."
- [x] 2.2 openvidu.io: none.
