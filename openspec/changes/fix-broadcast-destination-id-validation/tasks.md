# Tasks

## 1. Safe lookups

- [ ] 1.1 In `meet-ce/backend/src/helpers/broadcast.helper.ts`, replace the `savedUrls[id]` and `urls[destinationId]` reads with own-property checks (`Object.hasOwn`) or `Map`s. Verify in the existing helper cases (`meet-ce/backend/tests/unit/helpers/`) with ids `constructor`, `toString` and `__proto__`: each is refused as not one of the room's destinations, not as a duplicate.
- [ ] 1.2 Add one `updateRoomConfig` case with `id: 'constructor'` answering `422` "not one of the room's destinations" to the broadcast room-config integration suite under `meet-ce/backend/tests/integration/api/rooms/` (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Spec

- [ ] 2.1 Update requirement "A redacted URL sent back keeps the saved key" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` with a scenario "Destination id that is not saved" (WHEN `updateRoomConfig` sends a destination with the `id` `constructor`; THEN `422` and the stored destinations are unchanged).

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own.
- [ ] 3.2 openvidu.io: none.
