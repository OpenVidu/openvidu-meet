# Tasks

Paths are relative to `meet-ce/backend/`.

## 1. Leave foreign rooms alone

- [ ] 1.1 In `handleEgressEvent` of `src/services/broadcast.service.ts`, stop an egress with no record only when `roomService.meetRoomExists(egress.roomName)` is true, reading it only on that path. Verify in `tests/unit/services/broadcast.service.test.ts`: an unknown egress of a room that exists is stopped, of a room unknown to the database is not, and a known egress is handled as before without the extra read.
- [ ] 1.2 Check the caller in `src/services/livekit-webhook.service.ts` (the `createdBy` metadata check) still lets the event through, and add one webhook case in `tests/integration/api/webhooks/` with an egress of a room missing from the database (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Spec

- [ ] 2.1 Update requirement "Nothing streams without its broadcast" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` with a scenario "Egress of a room this server does not know" (GIVEN another Meet sharing the media server; WHEN it starts a stream egress in its room; THEN this server leaves it running).

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own.
- [ ] 3.2 openvidu.io: none.
