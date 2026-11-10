# Tasks

## 1. Server

- [ ] 1.1 Add `MeetRoomHelper.grantsWithin(link, holder)` and the permissions each anonymous link grants (design D2), and make `applyPermissionFiltering` keep each `access.anonymous.<role>.url` only when the caller holds `roomShareAccessLinks` and the link grants nothing it lacks. Have `computeFieldsForRoomQuery` add `roles` when the filtering applies, and drop it from the response when it was not requested. Unit tests of `grantsWithin` and of the filtering:
  - the default moderator gets the three links;
  - a speaker with `roomShareAccessLinks` gets the speaker and recordings links but not the moderator one;
  - a moderator member with a custom denial loses the moderator link;
  - `allPermissions()` keeps every link;
  - a projection without `roles` returns no `roles`.
- [ ] 1.2 Integration tests in the existing `backend/tests/integration/api/rooms/get-room.test.ts` and `get-rooms.test.ts`: the scenarios of "Disclosure of the anonymous links", with room member tokens from the moderator and speaker links, a `room_member` user with custom permissions, the owner and an API key; the response carries `roles` only when `extraFields` asks for it.
- [ ] 1.3 OpenAPI `backend/openapi/rooms/schemas/meet-room-access.yaml`: each of the three URL descriptions says it is present only when the caller holds `roomShareAccessLinks` and every permission that link grants. Typings TSDoc: `roomShareAccessLinks` in `typings/src/database/room-member-permissions.ts` (shares only the links whose permissions the holder has), and `SENSITIVE_ROOM_FIELDS_ENTRIES` and `MeetRoomSensitiveFieldPath` (the permission is necessary, not sufficient; design D3).

## 2. Frontend

- [ ] 2.1 `RoomShareDialogComponent` shows the speaker and moderator options only when their URL is present, and `RoomAccessLinkService` treats a missing speaker URL as no link (design D4). Karma specs: the dialog without the moderator URL offers the user and speaker links; the meeting service with `roomShareAccessLinks` and no speaker URL exposes no link and leaves `speakerLinkDisabled` set.
- [ ] 2.2 SPA end-to-end, in the existing `frontend/e2e/share-link.test.ts`: a participant whose permissions do not cover the speaker link sees no share link and the "waiting for others" text while alone. Run against an isolated backend, or report it as not run.

## 3. `add-waiting-room`

- [ ] 3.1 Remove the risk "`roomShareAccessLinks` reveals the moderator link" from its design. Replace the `roomShareAccessLinks` sentence of "Only participants who joined act on the meeting" with: "it reveals only links whose permissions the holder has (`share-links-within-own-permissions`), and the moderator link grants `lobbyBypass`, so a waiter never reads it". Drop the TSDoc, wizard and feature-page tasks about that risk from its proposal and tasks.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`, 3.10.0, `Fixed`, `Integration`: "A room member holding `roomShareAccessLinks` received every anonymous link of the room from `getRoom` and `getRooms`, the moderator link included. Each link is now returned only to a caller that also holds every permission it grants." Link the two operations with reference-style 3.10 definitions.
- [ ] 4.2 openvidu.io `next`, `docs/meet/features/rooms/access.md`: the share sections say that a user or participant is offered only the anonymous links whose permissions they hold.
- [ ] 4.3 Regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`.
- [ ] 4.4 `npx openspec validate share-links-within-own-permissions --strict`, then archive inside the pull request.
