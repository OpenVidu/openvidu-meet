# Tasks

## 1. Rooms OpenAPI

- [ ] 1.1 In `meet-ce/backend/openapi/rooms/schemas/meet-room-access-config.yaml`, set `user.enabled` `default: false` and `example: false`.
- [ ] 1.2 In `meet-ce/backend/openapi/rooms/schemas/meet-room-options.yaml` and `meet-room.yaml`, describe `autoDeletionDate` as: once the date passes, the room keeps working, new participants included, until the expired-rooms sweep, which runs every hour, processes it with its `autoDeletionPolicy`.
- [ ] 1.3 In `meet-room.yaml`, word `roles` like `config`: included with the `extraFields` query parameter or the `X-ExtraFields` header on every request; declare `room-fields.yaml` and `room-extra-fields.yaml` on `createRoom` and `updateRoomStatus` in `meet-ce/backend/openapi/rooms/rooms.yaml`.
- [ ] 1.4 In `meet-ce/backend/openapi/rooms/schemas/meet-permissions.yaml`, say that room roles merge key by key while a member's `customPermissions` are replaced as a whole on `updateRoomMember` (an omitted override falls back to the base role), and that `mediaChangeVirtualBackground` is applied by the participant's browser and not enforced by the server.
- [ ] 1.5 Replace the em dashes in `meet-room-config.yaml` and `meet-permissions.yaml`.
- [ ] 1.6 Verify with `pnpm run lint:api` and `./meet.sh test-unit-backend` (`meet-ce/backend/tests/unit/openapi-permission-examples.test.ts` reads these schemas).

## 2. Room members OpenAPI

- [ ] 2.1 In `meet-ce/backend/openapi/room-members/room-members.yaml`, make the `404` of `addRoomMember` cover a missing room and a `userId` that names no user (one response with both examples, reusing the messages of `rooms/responses/errors/room-not-found.yaml` and `users/responses/errors/user-not-found.yaml`).
- [ ] 2.2 In the same file, describe who may call `getRoomMember`: an API key, an admin, the room's owner, a `room_manager` reading their own membership, and a room member token issued for that same member; everyone else gets `403`.
- [ ] 2.3 In `meet-ce/backend/openapi/room-members/requests/update-room-member.yaml`, say that `customPermissions` replaces the member's overrides as a whole.
- [ ] 2.4 Replace the em dash in `meet-ce/backend/openapi/room-members/internal/schemas/room-member-token-options.yaml`, and verify with `pnpm run lint:api` and `./meet.sh build-rest-api-doc`.

## 3. Release surfaces

- [ ] 3.1 No `CHANGELOG.md` line: documentation only, per the root `CLAUDE.md` changelog rules.
- [ ] 3.2 openvidu.io: regenerate the REST API reference on `next` with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`; no page is edited.
