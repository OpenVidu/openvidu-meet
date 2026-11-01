# Tasks

## 1. Claim per meeting

- [ ] 1.1 Add the optional meeting id to the room model and zod/Mongoose schema, store it in `activateMeeting` and clear it in `finishMeeting` (`meet-ce/backend/src/repositories/room.repository.ts`); `handleRoomStarted` in `livekit-webhook.service.ts` passes the room's `sid`. Verified in `tests/unit/services/livekit-webhook.service.test.ts`.
- [ ] 1.2 `finishMeeting(roomId, sid?)` conditions on the stored id when `sid` is given; a start with another `sid` while `active_meeting` ends the recorded meeting and starts the new one. Verified in the same unit file: the out-of-order start gets `meetingStarted` and its own end gets `meetingEnded`.
- [ ] 1.3 In `handleRoomFinished`, release name reservations and presence when the claim finds no active meeting. Verified in the same unit file with a room never activated.
- [ ] 1.4 In `meet-ce/backend/src/services/room-scheduled-tasks.service.ts` (reconcile), read the stored id with the active rooms and finish with it. Verified in `tests/unit/services/room-scheduled-tasks.service.test.ts` with a meeting that started between the check and the claim.
- [ ] 1.5 Integration: replay `room_started(B)` before `room_finished(A)` against an isolated backend and assert the webhooks (needs the OpenVidu local deployment; report as not run when unavailable). Never send requests to the maintainer's dev backend on `:6080`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. It completes the 3.10.0 line on `meetingEnded` sent once (#133); check that its wording stays true.
- [ ] 2.2 openvidu.io: none.
