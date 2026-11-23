# Tasks

No typings work: the operation answers the existing `MeetRoomMember`. The backend group (1) comes first; the console (2) and meeting (3) groups build on its operation and can then run side by side.

## 1. Backend: `roomRegenerateMemberAccessUrl`

- [x] 1.1 Extract the identified guest link builder from `RoomMemberService.createRoomMember` into one helper, and add `RoomMemberService.regenerateAccessUrl(roomId, memberId)` with the new `errorRoomMemberNotIdentifiedGuest` (`409`) in `models/error.model.ts` (design D1); verify with `./meet.sh verify`
- [x] 1.2 Add the route to `internalRoomRouter` with the middleware chain of design D1 and the controller `regenerateRoomMemberAccessUrl`; verify with `./meet.sh verify`
- [x] 1.3 Document the operation in `meet-ce/backend/openapi/room-members/internal/room-members.yaml` and reference it from `openvidu-meet-internal-api.yaml` (`200` with `MeetRoomMember`, `401`, `403`, `404`, `409`); verify the OpenAPI lint step of `./meet.sh verify`
- [x] 1.4 Add a request helper to `meet-ce/backend/tests/helpers/request-helpers.ts` and the integration test `meet-ce/backend/tests/integration/api/room-members/regenerate-room-member-access-url.test.ts` covering the scenarios of "Regenerating an identified guest's link": new link with the other fields unchanged and no `effectivePermissions`, previous `secret` refused with `404` and new one accepted, a guest whose stored link carries the `memberId` alone, a room member token issued before still accepted, a guest who knocked on a locked room with the previous link and is admitted afterwards refused with `404`, a user member `409` with its `accessUrl` unchanged, an unknown member and a room that does not exist `404`; verify they pass through `test-runner`
- [x] 1.5 Add the operation to `meet-ce/backend/tests/integration/api/security/room-members-security.test.ts` covering "Who regenerates a guest's link": admin and owner `200`, API key and room member token `401`, a `room_manager` who is only a member `403`; verify they pass through `test-runner`

## 2. Console: regenerate a guest's link

- [x] 2.1 Add `regenerateAccessUrl(roomId, memberId)` to the frontend `RoomMemberService` on the internal API prefix; verify with `./meet.sh verify`
- [x] 2.2 In `room-members-list`, replace the remove button with the more options button and menu ("Regenerate link" for identified guests, "Remove member"), add the `'regenerateLink'` action, and make the warning icon start it on click and Enter (design D2); verify with `./meet.sh verify`
- [x] 2.3 Handle `'regenerateLink'` in `RoomDetailComponent`: confirmation, call, dialog with the new link whose main button copies it, member replaced in the list, failure notice (design D2); verify with `./meet.sh verify`
- [x] 2.4 Add the new keys to every locale of `room-members/lang/` and change `ROOM_MEMBERS.LIST.DEPRECATED_ACCESS_LINK` to the tooltip of the proposal's assumptions; verify each locale file carries every key
- [x] 2.5 In `meet-ce/frontend/e2e/console/room-detail.test.ts`, update the test of the warning icon to the new tooltip and the tests that remove a member to open the more options menu first, and add tests for "Row actions", "Regenerate and copy", "Cancelled", "User member" and "Clicking the icon" (the members list intercepted with `page.route` as the existing test does); verify they pass headless through `test-runner`

## 3. Meeting: the "Invalid member" message

- [x] 3.1 Change `NAVIGATION_ERROR.INVALID_MEMBER.MESSAGE` in every locale of `shared/lang/` to the text of the proposal's assumptions; verify each locale file carries it
- [x] 3.2 Add to `meet-ce/frontend/e2e/helpers/meet-api.helper.ts` a helper `regenerateRoomMemberAccessUrl(accessToken, roomId, memberId)` that takes the access token, as `createRoomAsUser` does; the test creates the admin with `createReadyUser` (`auth.helper.ts`) and removes it with `deleteUsers`. Add to the access error screens of `meet-ce/frontend/e2e/access.test.ts` the previous link of a regenerated guest, asserting the "Invalid member" title and the new message ("Regenerated guest link" of the `meeting-join` delta); verify it passes headless through `test-runner`

## 4. Release surfaces

- [x] 4.1 `CHANGELOG.md` (3.10.0), following `.claude/rules/changelog.md`: an `Added`, `UI` line for regenerating an identified guest's link from the Room Members tab, and the `Deprecated` text about links issued before 3.10.0 naming that action as the way to replace one; verify the 3.10.0 section reads as one entry per feature
- [x] 4.2 openvidu.io `docs/meet/features/room-members/management.md` on `next` (the checkout at `<main checkout>/../openvidu.io`, edited in place without a worktree): a section on regenerating a guest's link (the previous link stops working, the guest stays in the meeting, the new link is shown to copy) and the note on guests added before 3.10.0 pointing to it; verify with `ovweb lint` on the page

## Workflow follow-up

- `./meet.sh verify`, then `refactorer`, then the tests `./meet.sh affected` lists, then `change-reviewer`.
- `/opsx:archive` inside the same pull request, before merging, then add `roomRegenerateMemberAccessUrl` to the internal API surfaces of the `## Purpose` of `openspec/specs/room-members/spec.md` (a delta cannot change it), and run `./meet.sh verify --only openspec --all`.
