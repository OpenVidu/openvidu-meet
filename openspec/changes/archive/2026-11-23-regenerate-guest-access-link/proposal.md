# Proposal

## Decisions

USER, request of 2026-11-23:

1. An internal, permanent endpoint generates a new link, in the current form, for an identified guest. It serves to move a guest added before 3.10.0 to the current form by hand and to invalidate a leaked link. It is used only from the console.
2. The console has a button to regenerate the link, with a confirmation. Once accepted, the console shows the new link so that it can be copied.
3. The tooltip of the warning icon on guests whose link predates 3.10.0 is adapted and offers the same regenerate action.
4. It is available for every identified guest, whatever the form of their link.
5. Regenerating the link does not remove the guest from the meeting.

USER, answers of 2026-11-23 (round 1):

6. The tokens already issued with the previous link stay valid. Consequences accepted with the answer: a session already opened with a leaked link also stays until it leaves (a manager can kick it), and a guest whose permissions change later in that same meeting gets the "access revoked" screen, because the meeting renews their token with the link they joined with. Leaving includes reloading the page, which enters again with the previous link and gets the "Invalid member" screen.
7. Only an admin or the room's owner, signed in to the console, regenerates a link: no API key and no room member token, as the other internal routes of the console.
8. A `matTooltip` cannot hold a link, so clicking the warning icon (or pressing Enter on it) opens the same confirmation as the button, and the tooltip says so.
9. Contract: `POST /internal-api/v1/rooms/{roomId}/members/{memberId}/access-url`, operationId `roomRegenerateMemberAccessUrl`. It answers `200` with the member and its new `accessUrl`, `404` when the member does not exist and `409` when it is a user, who has no personal link of their own.

USER, answers of 2026-11-23 (rounds 2 and 3):

10. Whoever opens a link that no longer grants access keeps getting the "Invalid member" screen, and its message is reworded so it fits a regenerated link as well as a removed guest: the link is no longer valid and the person who invited them can give them a new one.
11. A guest waiting to be let in to a locked room with the previous link is refused when admitted, with the "Invalid member" screen: regenerating also keeps out whoever waits with a leaked link.

USER, request of 2026-11-23 (after the review):

12. The actions column of the Room Members tab holds exactly three buttons: copy the access link, edit, and a more options button that opens a menu with "Regenerate link" and "Remove member". Removing a member moves from its own button into that menu.

## Assumptions

- "Regenerate link" appears in the more options menu of identified guests only; the menu of a user member holds only "Remove member".
- The confirmation names the guest and says that their current link stops working, that they stay in the meeting if they are in it until they leave it, and that the new link has to be sent to them.
- The new link is shown in a dialog whose main button copies it to the clipboard and confirms the copy with the usual notice.
- The tooltip on a guest whose link predates 3.10.0 reads: "This link may be insecure because it was created before OpenVidu Meet 3.10.0. Click to regenerate it. In 3.13.0 Meet replaces it and the old link stops working."
- The "Invalid member" message reads: "This link is no longer valid. Ask the person who invited you for a new one."
- Every new text is translated into every locale of its bundle.

## Why

The only way to replace an identified guest's link today is to remove the guest and add them again, which gives them a new `memberId`, removes them from the room's ongoing meeting and makes the manager enter their role and permissions again. That is the remedy the console offers for the links issued before 3.10.0, whose `secret` any participant of a meeting with the guest can read, and it is also the only remedy for a link that leaked.

## What Changes

- New internal operation `roomRegenerateMemberAccessUrl`: an admin or the room's owner gives an identified guest a new `accessUrl` of the current form (same `memberId`, new random part). The previous link stops granting access. The member's identity, role, permissions and membership date do not change, and the tokens already issued stay valid, so a guest in the meeting stays in it.
- Console, Room Members tab: a regenerate link button on each identified guest, with a confirmation, after which the new link is shown to be copied. Clicking the warning icon of a guest whose link predates 3.10.0 starts the same action, and its tooltip says so.
- Meeting: the "Invalid member" screen says the link is no longer valid and that the person who invited them can give them a new one.
- Unchanged: the public REST API, the webhooks, the embedded API, the 3.13.0 plan for the links issued before 3.10.0, and `roomUpdateMember`, which keeps the `accessUrl` as it is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: the regenerate operation and who may call it, the console action, the warning icon that starts it, and regenerating as a way to give a guest added before 3.10.0 a link of the current form.
- `meeting-join`: the "Invalid member" screen also answers a regenerated guest link.

## Impact

- Internal API: new operation `roomRegenerateMemberAccessUrl`, documented in `meet-ce/backend/openapi/room-members/internal/`. No compatibility promise, as every internal operation.
- REST API (public), webhooks, embedded API, typings: no change. The operation answers the existing `MeetRoomMember`.
- Console UI: the more options menu of each member row, which now holds removing the member, the regenerate action, its confirmation and the dialog with the new link; the warning icon becomes clickable and its tooltip changes; new texts in the room members bundle.
- Meeting UI: the "Invalid member" message, in the shared bundle.
- Deployment: no change; no migration, no configuration. Several replicas: one write to the member's stored `accessUrl`, read by every replica.
- CE extension seams: none needed; the action lives in the members list of the shared library and the room member service, which every edition reuses.
- openvidu.io (`next`): `docs/meet/features/room-members/management.md` gets a section on regenerating a guest's link, and its note on guests added before 3.10.0 offers regenerating instead of removing and adding them again. The REST API reference does not change: the operation is internal.
- `CHANGELOG.md` (3.10.0): an `Added`, `UI` line for regenerating a guest's link from the console, and the `Deprecated` text about the links issued before 3.10.0 names that action as the way to replace one.
