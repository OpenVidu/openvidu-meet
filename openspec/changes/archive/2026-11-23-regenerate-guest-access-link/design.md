# Design

## Context

- An identified guest's link lives only in the member's stored `accessUrl` (`/room/{roomId}?secret=<memberId>-<random>`, built in `RoomMemberService.createRoomMember`), and `resolveIdentifiedGuestBySecret` accepts a `secret` only when it equals the `secret` of that stored URL. Replacing the stored URL is therefore enough to retire the previous link: no index, no other field, no migration.
- `RoomMemberRepository.updatePartial(roomId, memberId, partial)`, on top of `BaseRepository.updatePartialOne`, updates one member with a single `findOneAndUpdate` and returns the whole member.
- Room member tokens are checked against `permissionsUpdatedAt` (`TokenService.checkRoomMemberTokenCurrency`). Leaving that timestamp alone is what keeps the tokens already issued valid (decision 6).
- In the meeting, the client keeps the `secret` it joined with and uses it in `RoomMemberContextService.regenerateToken`, which runs after a permission change and as the fallback of a refused refresh. After a regeneration that `secret` answers `404`, which `updateTokenInMeeting` treats as access revoked: the consequence decision 6 accepts.
- The console's internal routes authenticate the user's access token only (`internalRoomRouter`, `/rooms/summary`), and `authorizeRoomManagement` lets an admin or the room's owner through, as for `roomUpdateMember`.
- The members list emits a `MemberTableAction` (`room-members-list.component.ts`) that `RoomDetailComponent.onMemberAction` handles, and the warning icon of the previous change is a focusable `mat-icon` with `matTooltip`. `DialogService.showDialog` opens the console's confirmation dialog.

## Decisions

### D1. The operation (decisions 1, 6, 7, 9, 11)

- Route in `internalRoomRouter`: `POST /:roomId/members/:memberId/access-url` with `apiLimiter`, `withAuth(accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.ROOM_MANAGER))`, `withValidRoomId` and `authorizeRoomManagement`, the chain of `roomUpdateMember` without the API key validator and without a body validator (the request has no body).
- `RoomMemberService.regenerateAccessUrl(roomId, memberId)` reads the member's `type`, throws `errorRoomMemberNotFound` when it does not exist and a new `errorRoomMemberNotIdentifiedGuest` (`409`, "Room Member Error", "Room member '<memberId>' of room '<roomId>' is not an identified guest and has no personal link to regenerate") for a user, then writes `accessUrl` with `updatePartial` and returns the member. The link is built by one helper shared with `createRoomMember`, so both produce the same form. A room that does not exist is answered `404` by `authorizeRoomManagement` before the service runs.
- `permissionsUpdatedAt` is not touched and nothing is sent to the meeting: the guest's live session and its tokens are left as they are.
- Controller `regenerateRoomMemberAccessUrl` in `room-member.controller.ts` answers `MeetRoomMemberHelper.addResponseMetadata(memberToWire(MeetRoomMemberHelper.applyFieldFilters(member)))`. It takes no query (no `res.locals.validatedQuery` to read), so the member is answered without `effectivePermissions`, as every member response by default.
- OpenAPI (internal): the path in `meet-ce/backend/openapi/room-members/internal/room-members.yaml`, referenced from `openvidu-meet-internal-api.yaml`, answering `MeetRoomMember` and the `401`, `403`, `404` and `409` responses.

Alternative rejected by decision 9: extending `roomUpdateMember` with a flag. It would change a public operation for a console-only action.

### D2. Console (decisions 2, 3, 8, 12)

- `RoomMemberService` (frontend) gets `regenerateAccessUrl(roomId, memberId)` on the internal API prefix of `HttpService`.
- The actions column keeps the copy link and edit buttons and replaces the remove button with a more options button (`more_vert`, `more-actions-btn-<memberId>`) that opens a `mat-menu`, as the rooms list does (`rooms-lists.component.html`): "Regenerate link" (`regenerate-member-link-btn-<memberId>`, identified guests only) and "Remove member" (`delete-member-btn-<memberId>`, styled `delete-action`) (decision 12).
- The members list adds `'regenerateLink'` to `MemberTableAction`, emitted by that menu item and by the warning icon, which gets `(click)` and `(keydown.enter)` and a `role="button"`.
- `RoomDetailComponent` handles it: a confirmation through `DialogService.showDialog`, then the call, then a second dialog whose message is the new link and whose confirm button copies it with `Clipboard` and shows `ROOM_MEMBERS.NOTICES.LINK_COPIED`. The member is replaced in `memberList`, so the warning icon goes away for a guest added before 3.10.0. A failure shows a notice, as the other member actions do.
- New keys in `room-members/lang/*.json`: the button tooltip, both dialogs and the failure notice; `ROOM_MEMBERS.LIST.DEPRECATED_ACCESS_LINK` gets the text of the proposal's assumptions.

### D3. Meeting (decision 10)

Only `NAVIGATION_ERROR.INVALID_MEMBER.MESSAGE` changes, in every locale of `shared/lang/`. The server keeps answering the same `404` for a removed guest and for a regenerated link, so the screen cannot and does not tell them apart.

### Several replicas

One `findOneAndUpdate` on the member; every replica reads the stored `accessUrl` on each token request, so the new link works and the previous one stops on every replica at once. Two managers regenerating the same link at the same time each get a link back, and only the one written last works; the console shows each of them the link of their own request, as any concurrent edit of a member does today.

## Risks / Trade-offs

- [A session already opened with a leaked link stays in the meeting] → Accepted (decision 6). The manager kicks that participant from the meeting; once out, the previous link no longer lets them back.
- [A guest whose permissions change later in the same meeting gets the "access revoked" screen] → Accepted (decision 6). They enter again with the new link.
- [A guest in the meeting who reloads the page enters again with the previous link] → They get the "Invalid member" screen and need the new link (decision 6: the session lasts until it leaves).
- [A guest waiting in the waiting room with the previous link is refused when admitted] → Wanted (decision 11). The admission requests the token with the `secret` the guest knocked with (`join-token.service.ts`), which `generateRoomMemberToken` resolves before the ticket and answers `404`, so the guest gets the "Invalid member" screen. The admission is never used and the sweep expires it after `WAITING_PARTICIPANT_UNSEEN_TIMEOUT`, as any admission not used by joining today. No code changes for it.
- [A `room_manager` holding a stale console page regenerates a link already regenerated by another manager] → Both writes succeed; the last one wins. No lock: the cost of a lost link is one more regeneration.

## Migration Plan

Deploy. No stored data changes until a manager regenerates a link.
