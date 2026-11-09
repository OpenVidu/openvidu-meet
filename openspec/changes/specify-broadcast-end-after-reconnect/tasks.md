# Tasks

Frontend paths below are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/`.

## 1. Decide

- [ ] 1.1 Record the maintainer's answer to both questions of the proposal in its "Decisions to confirm", keep only the tasks of the chosen options below and drop the others.

## 2. A broadcast end missed during a reconnect

- [ ] 2.1 Option A: in `openvidu-components/models/broadcast.model.ts`, make `settleBroadcast()` settle a broadcast the server no longer lists as `aborted` without `endDate` or `duration`, dropping its `now` parameter, and say in the TSDoc of `BROADCAST_ENDED` and of its payload in `meet-ce/typings/src/embedded/events.ts` that an end missed while the participant was disconnected is reported as `aborted` without dates. Verify by adjusting "settles after reconnecting a broadcast that ended meanwhile, and keeps the ones the server still has" in `services/meeting-event-handler.service.spec.ts`.
- [ ] 2.2 Option B: in `meet-ce/backend/src/services/broadcast.service.ts` (`saveAndNotify`) and `broadcast-state.service.ts`, keep the final record of each ended broadcast in the room's field of `ov_meet:broadcasts` until the meeting ends (`cleanupRoom` and the reconciliation still forget the field), serve them from `broadcastList` and `broadcastGet`, and keep `broadcastActive` and the duplicate and stop checks on the broadcasts in progress only; in `services/meeting-event-handler.service.ts` (`onRoomReconnected`), apply what the server lists instead of settling locally, and remove `settleBroadcast()`. Verify with the unit test `broadcast.service.test.ts`, the integration test `meet-ce/backend/tests/integration/api/meetings/broadcasts.test.ts` (an ended broadcast is listed with its final status until the meeting ends; needs the OpenVidu local deployment, report as not run when unavailable) and `meeting-event-handler.service.spec.ts`; update the OpenAPI of `broadcastList` and `broadcastGet` in `meet-ce/backend/openapi/broadcasts/broadcasts.yaml` and run `redocly lint`.

## 3. The meeting's end

- [ ] 3.1 Option A: say in the TSDoc of `BROADCAST_ENDED` in `meet-ce/typings/src/embedded/events.ts` that broadcasts ending with the meeting are not reported to the host, which learns of the end through `meetingLeft`, and that the `broadcastEnded` webhook reports them.
- [ ] 3.2 Option B: before the LiveKit room is deleted on `meetingEnd` (`meet-ce/backend/src/controllers/meeting.controller.ts`), on the duration limit (`room-scheduled-tasks.service.ts`) and on a forced room deletion (`room.service.ts`), stop the room's broadcasts through `BroadcastService.stopBroadcasts`, through one helper used by all three, so the `meet_broadcast_updated` signal reaches the participants still connected. Verify with the unit test `broadcast.service.test.ts` and the webcomponent e2e suite `events.test.ts` ("BROADCAST_* Events": a host receives `broadcastEnded` with `complete` when a moderator ends the meeting while live; needs the OpenVidu local deployment, report as not run when unavailable).

## 4. Spec

- [ ] 4.1 Update requirement "Embedded broadcast events" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` with the chosen behaviors and a scenario for each ("Broadcast ended during a reconnect", "Meeting ended while live"); for option B of section 2, update "Reading broadcasts" too (an ended broadcast stays readable until the meeting ends), coordinating with `fix-broadcast-resync-without-meeting-read`, which changes the same requirement. If `add-live-broadcast` is already archived, write these instead as a `MODIFIED` delta of `live-broadcast` in this change and drop `skip_specs`.

## 5. Release surfaces

- [ ] 5.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own, and its entry does not describe this behavior.
- [ ] 5.2 openvidu.io: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` after the TSDoc change.
- [ ] 5.3 openvidu.io: in `docs/meet/features/meetings/live-broadcast.md`, section on the embedded API, say what the host receives when the meeting ends while live, following the chosen option.
- [ ] 5.4 For option B of section 2, regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`.
