## Why

`revoke-tokens-on-kick` (merged in #208) makes a kicked participant's earlier tokens stop connecting, but the token endpoint can still turn one back into a valid token. A request that presents an earlier token switches the join path into refresh mode, which checks that token only for its signature and room and then re-stamps the live session's metadata with a fresh token issue (`applyPermissionsToLiveParticipant`, `room-member.service.ts:1057`). A kicked participant who reconnects to LiveKit with the old token and asks for a fresh one before the `participant_joined` webhook removes them gets their session re-stamped, so the removal keeps it, and walks away with a valid token. The same happens when the meeting client asks for a fresh token between the revocation and the removal of a kick.

The same laundering works for a token issued before the room's roles or access were last updated: such a token is refused on every request, but refresh mode renews the session that connected with it. In a room with the waiting room on (`add-waiting-room`), both are ways back into the meeting without waiting, and the second one would let every token issued before the waiting room was turned on back in.

## What Changes

- In refresh mode, the token endpoint refuses (`401`) a live session whose metadata was issued before the participant's last revocation, or before the room's last roles, access or waiting-room change, instead of re-stamping it. A demotion is unaffected: it re-stamps the live session right after revoking, so that session is not revoked. A session outdated by a change of its member or user is still renewed.
- Nothing else changes: the in-meeting timer's refresh (`refreshRoomMemberToken`) already refuses an outdated live session, and a participant comes back through their link as before.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-moderation`: presenting a kicked participant's earlier token never renews the kicked session.
- `authentication`: presenting a token issued before a room change never renews a session that connected with it.

## Impact

- REST API, webhooks, embedded API: not affected; the internal token endpoint answers `401` in two more cases. The internal API has no compatibility promise.
- Meeting UI and console UI: a kicked client that tries its regenerate fallback gets `401` and stays on the kicked screen, as intended. A client that connected with a token issued before a room change gets `401` and is removed, and joins again through its link.
- Deployment: none.
- CE extension seams: none needed.
- `CHANGELOG.md`: none. `revoke-tokens-on-kick` is part of the unreleased 3.10.0 and its entry already says a kicked participant's tokens stop working; this makes that true. The room-change case concerns the internal endpoint only, and a token refused by every other request already reads as invalid.
- openvidu.io: none.

## Decisions taken

USER, 2026-11-09 (spec review round 9). Rounds 10 and 11 changed nothing in this change.

- One generic rule, with no waiting room case: refresh never renews a session that was revoked, or one older than the room's `rolesUpdatedAt`. Roles, access and the waiting room cannot change while a meeting runs, so only a session that connected with an outdated token is in that state.
- A session outdated by a change of its member or user stays renewable: those change during a meeting, and the meeting client's regenerate fallback relies on it.
- `add-waiting-room` turns the waiting room on by stamping `rolesUpdatedAt`, so this rule is what keeps tokens issued before it out; this change is archived before `add-waiting-room`.
- 3.10.0, CE only, any number of replicas.
