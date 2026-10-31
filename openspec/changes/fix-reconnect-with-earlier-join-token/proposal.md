# Proposal

## Why

A participant whose permissions were taken away during a meeting can reconnect to the media server with a join token issued earlier and get the old permissions back: a demoted moderator is a moderator again, and a member denied chat or camera can send again. The token renewal then trusts what the media server holds and issues a valid Meet token with the restored permissions, so every fix that revokes access during a meeting can be undone by the client it targets.

## What Changes

- A session that connects with a join token issued before a change that revoked it (demotion, member update, user role change, deletion of the member) is removed from the meeting as soon as its join is processed.
- Every server push to a live participant stamps the participant's metadata as current, so a legitimate reconnection with the credentials the media server keeps for the session is not refused.
- `refreshRoomMemberToken` refuses to renew from live metadata that fails the checks a token has to pass.
- The approach, with the alternatives that LiveKit's capabilities rule out as a sole fix, is in `design.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `permissions`: new requirement "An earlier join token does not restore revoked access". It completes "The media grant follows permission changes", whose scenario "Client that ignores the renewal request" only covers a reconnection with a fresh token.

## Impact

- REST API: `refreshRoomMemberToken` (internal) answers `401` where it answered `200` for live metadata older than a revocation; no public contract changes.
- Webhooks: a rejected session produces no `participantJoined`; see the decision below for its `participantLeft`.
- Meeting UI: a rejected session leaves the meeting as for a removal by the server; a client that reconnects with its own current session is unaffected.
- Embedded API, console UI, deployment configuration: not affected.
- Code: `handleParticipantJoined` of the LiveKit webhook service, the token checks of `auth.middleware.ts`, `refreshRoomMemberToken` and the live metadata pushes of `room-member.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- A stale session at join. Proposed: remove it. Alternative: rebuild its metadata and grant from stored state for members and users, and remove only anonymous participants (more code, and anonymous roles and promotions cannot be rebuilt).
- Webhooks of a rejected session. Proposed: check before sending `participantJoined` and keep `participantLeft` quiet for that session. Alternative: send both events so every `participantLeft` pairs with a `participantJoined`.
- A kicked participant reconnecting with the same join token. Proposed: unchanged, because `meeting-moderation` "A kick does not revoke access" lets them join again at once. Alternative: record a revocation at kick time.
- Delivery: private advisory or regular public pull request.

## Source

3.10.0 pre-release audit, finding RM-1 (high, verified-live), introduced by earlier releases (the media server has always accepted an issued token until it expires); the 3.10.0 grant push (#131) and demotion revocation (#103) depend on it.
