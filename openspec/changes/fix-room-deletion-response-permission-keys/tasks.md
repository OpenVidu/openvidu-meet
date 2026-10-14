# Tasks

## 1. Serialize the deletion responses

- [ ] 1.1 Pass the room of `deleteRoom` and each `deleted[].room` of `bulkDeleteRooms` through `roomToWire` in `meet-ce/backend/src/controllers/room.controller.ts`, and verify with a case in the "Both key sets on output" block of `meet-ce/backend/tests/integration/api/rooms/permission-naming.test.ts`: a `deleteRoom` with `extraFields=roles` that returns the room (scheduled with `withMeeting=when_meeting_ends` on a room with an active meeting) returns roles carrying both `chatWrite` and `canWriteChat`, and the same for a `bulkDeleteRooms` entry.
- [ ] 1.2 Run `./meet.sh test-unit-backend` and `pnpm run test:integration-rooms` (needs the local deployment; report it as not run otherwise).

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "The room returned by `deleteRoom` and `bulkDeleteRooms` carried its `roles` with the current permission keys only. It now carries the deprecated `can*` keys next to them, as every other room response does."
- [ ] 2.2 openvidu.io: none.
