# Tasks

## 1. Keep the query on every page

- [x] 1.1 In `findMany` of `meet-ce/backend/src/repositories/base.repository.ts`, combine the page token condition
  with the caller's filter through `$and` instead of writing it into the filter's `$or`, and always read the sort
  field, stripping it from the result when the caller did not request it. Verify in
  `meet-ce/backend/tests/integration/api/rooms/get-rooms.test.ts` (scope of a `room_manager` and a `room_member`
  paged one room at a time; `fields=roomId` across two pages),
  `meet-ce/backend/tests/integration/api/users/get-users.test.ts` (`userId` plus `name` paged one user at a time),
  `meet-ce/backend/tests/integration/api/room-members/get-room-members.test.ts` and
  `meet-ce/backend/tests/integration/api/recordings/get-recordings.test.ts` (`fields` without the sort field across
  two pages).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: two lines under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`, one for the
  scope and filters lost after the first page, one for the empty page with `fields`.
- [x] 2.2 openvidu.io: none.
