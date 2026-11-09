# Tasks

## 1. Let a participant list the broadcasts of their meeting

- [ ] 1.1 In `meet-ce/backend/src/middlewares/room.middleware.ts`, add next to `withRoomPermissionForOthers` a check that lets through a room member token that names a participant (`RequestSessionService.getParticipantIdentity()`) in the requested room and falls back to `withRoomPermission` otherwise, and use it with `meetingRead` and `queryRoomId` for `GET /broadcasts` in `meet-ce/backend/src/routes/broadcast.routes.ts`; `GET /broadcasts/:broadcastId` keeps `withRoomPermission('meetingRead', broadcastRoomId)`.
- [ ] 1.2 Verify in the "Broadcast Tests" of `meet-ce/backend/tests/integration/api/security/meeting-security.test.ts`: a participant's room member token whose role denies `meetingRead` lists the broadcasts (`200`), the same token reading one broadcast is `403`, and a room member token of another room is still `403`. Run the backend integration suite (needs the OpenVidu local deployment; report as not run when unavailable), plus `./meet.sh test-unit-backend` and `./meet.sh lint-backend`.
- [ ] 1.3 Say in the description of `broadcastList` in `meet-ce/backend/openapi/broadcasts/broadcasts.yaml` that it takes an API key, a room member token holding `meetingRead`, or the room member token of a participant of the meeting; verify with `redocly lint` and the API naming lint.
- [ ] 1.4 Add to the "broadcast signal" cases of `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/meeting-event-handler.service.spec.ts` that a refused catch-up (`getBroadcasts` rejecting) keeps the broadcasts in progress as they were. Run `./meet.sh test-unit-frontend`.

## 2. Spec

- [ ] 2.1 Update requirement "Reading broadcasts" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md`: `broadcastList` also answers the room member token of a participant of the meeting; replace the scenario "Token holding meetingJoin alone" with "Participant without meetingRead" (`broadcastList` with that participant's token answers `200`, `broadcastGet` answers `403`). Add to "Live status shown to every participant" a scenario "Broadcast ended during a reconnect" (GIVEN a participant without `meetingRead` in a meeting live to one destination; WHEN their connection drops, the broadcast ends and the connection comes back; THEN the LIVE mark disappears). If `add-live-broadcast` is already archived, write these instead as a `MODIFIED` delta of `live-broadcast` in this change and drop `skip_specs`.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own, and its entry does not describe this behavior.
- [ ] 3.2 openvidu.io: regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`; `docs/meet/features/meetings/live-broadcast.md` needs no change.
