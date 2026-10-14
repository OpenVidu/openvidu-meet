# Tasks

## 1. Status update during a meeting

- [ ] 1.1 Add the `Room Error` factory for a room scheduled for deletion (`409`) to `meet-ce/backend/src/models/error.model.ts` and verify `pnpm run lint` passes.
- [ ] 1.2 Rewrite `updateMeetRoomStatus` in `meet-ce/backend/src/services/room.service.ts` as the conditional writes of design.md (one re-read on a miss) and verify with new cases in `meet-ce/backend/tests/integration/api/rooms/update-room-status.test.ts`: `open` during a meeting with `close` scheduled answers `200` with `active_meeting` and `none`; `closed` with `delete` scheduled answers `202` keeping `delete`; `open` with `delete` scheduled answers `409` and changes nothing.
- [ ] 1.3 In the same test file, verify that after `open` during a meeting the periodic reconciliation sends no second `meetingStarted` (the room stays `active_meeting`), reusing the reconciliation trigger of `meet-ce/backend/tests/integration/api/rooms/active-status-rooms-gc.test.ts`.
- [ ] 1.4 Update the `updateRoomStatus` description and the `status` request description in `meet-ce/backend/openapi/rooms/rooms.yaml` and `meet-ce/backend/openapi/rooms/requests/update-room-status.yaml`, add the `409` response, and verify `pnpm run lint:api` passes.

## 2. Meeting end applies the action it read

- [ ] 2.1 Make the `close` and `none` branches of `handleRoomFinished` in `meet-ce/backend/src/services/livekit-webhook.service.ts` write conditionally on the `meetingEndAction` they read, re-reading and applying the current action on a miss; verify with cases in `meet-ce/backend/tests/unit/services/livekit-webhook.service.test.ts` where the action changes between the read and the write (close scheduled late is applied, close cancelled late leaves the room `open`).
- [ ] 2.2 Run `./meet.sh test-unit-backend` and the rooms integration group (`pnpm run test:integration-rooms`, needs the local deployment; report it as not run otherwise).

## 3. Release surfaces

- [ ] 3.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "[`updateRoomStatus`][3.10-update-room-status] with `open` during a meeting set the room `open` while the meeting went on, cancelling a scheduled close or deletion and sending a second `meetingStarted` webhook, and `closed` turned a scheduled deletion into a close. During a meeting the room now stays `active_meeting`: `open` cancels only a scheduled close and answers `409` when a deletion is scheduled, and `closed` keeps a scheduled deletion." with the reference definition `[3.10-update-room-status]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/updateRoomStatus` at the end of the file.
- [ ] 3.2 openvidu.io: no page changes (`docs/meet/features/rooms/management.md` stays true); regenerate the REST API reference on `next` with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` for the new `409`.
