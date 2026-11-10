# Design

## Context

- `RoomMemberService.generateTokenForJoiningMeeting` (`room-member.service.ts:468`) switches into refresh mode when a previous token contributes a known identity (:486). The previous token is checked for its signature and room only (`getValidatedRoomMemberTokenContext`, :624), and refresh mode calls `applyPermissionsToLiveParticipant` (:546, :1057), which writes the new permissions and a fresh `getTokenIssue` into the live participant's metadata.
- `refreshRoomMemberToken` (:582), the in-meeting timer's path, already refuses a live session whose metadata fails `checkRoomMemberTokenCurrency` (`buildTokenMetadataFromParticipant`, :850).
- `ParticipantTokenRevocationService.isRevoked(roomId, identity, metadata)` tells a session issued before the identity's last revocation, comparing the revocation recorded in its metadata (`issuedAfterRevocation`) with the current one, without comparing clocks.
- A kick (`revoke-tokens-on-kick`) revokes and then removes the participant. A demotion revokes and then re-stamps the live session inside the participant lock (:1007-1013).
- `updateRoomRoles` and `updateRoomAccess` stamp the room's `rolesUpdatedAt` (`room.service.ts:365`, :443), and the currency check refuses a token issued before it (`token.service.ts:188`). None of them, nor `updateRoomConfig`, runs while a meeting is active (`room.service.ts:251-253`, :356-358, :434-436).
- `LivekitWebhookService.removeSessionWithRevokedToken` re-reads the live participant and keeps the session when its metadata is current.

## Goals / Non-Goals

**Goals:**
- A kicked participant cannot obtain a valid token, nor keep a reconnected session, by presenting a token issued before the kick.
- A session that connected with a token issued before the room's last roles, access or waiting-room change cannot be renewed into a valid one.

**Non-Goals:**
- Refusing refresh for a session outdated by a change of its member or user: those change during a meeting, and the meeting client's regenerate fallback relies on refresh mode to recover from them.
- Making the removal on `participant_joined` fail closed: with this change a kept session cannot renew its token, and its token already fails the currency check on every request.

## Decisions

- Refresh mode reads the live participant's metadata before applying anything and answers `401` (`errorInvalidToken`) when `isRevoked` says it was issued before the identity's last revocation.
- Refresh mode also answers `401` when the live metadata's `iat` precedes the room's `rolesUpdatedAt`, read with the room it already loads (:475). Roles, access and the waiting room cannot change while a meeting runs, so such a session connected with an outdated token: renewing it would launder it past the removal on `participant_joined`.
- Nothing else of the currency is checked: a session outdated by a member or user change is what refresh mode exists to bring up to date.
- The check reuses `isRevoked`, so a kick, a demotion and any later revocation share one rule. A demoted participant's session was re-stamped after its revocation, so it passes.
- The live participant is already read by `applyPermissionsToLiveParticipant`; both checks go inside it, before the metadata is rewritten, so there is one read and one decision under the participant lock.

## Risks / Trade-offs

- [Several replicas] → The revocation lives in Redis, `rolesUpdatedAt` in MongoDB and the live metadata in LiveKit; any replica serving the request reads all three.
- [A demotion and a refresh racing] → The demotion re-stamps under the participant lock that refresh mode also takes, so a refresh sees either the revoked metadata before the re-stamp (`401`, and the client retries through its fallback) or the re-stamped one.
- [A roles or access update racing a meeting's start] → The update is refused once the meeting is active, but one that lands in the instant before the first participant connects leaves that meeting's sessions older than `rolesUpdatedAt`: refresh mode refuses them and they join again through their link.
- [A promotion or member update in the instant between a stale reconnection and its removal] → It re-stamps that session, which the removal then keeps. It needs a privileged actor's coincident action, and the session's later requests still carry its own token until it is renewed.
