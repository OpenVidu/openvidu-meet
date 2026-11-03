# Proposal

## Why

A room member token lets its holder raise or lower their own hand without any permission, but the server only compares the token's identity with the hand's, not the token's room with the meeting's. A token issued for room A therefore raises or lowers the hand of the same identity in room B, sending a `participantHandChanged` webhook for room B, although every other operation answers `403` to a token of another room. Identities repeat across rooms for users and members, so a token of another room, or one kept after room B revoked the holder's tokens, still changes that hand in room B.

## What Changes

- `participantHandUpdate` lets a room member token act on its own hand without a permission only when the token was issued for the room in the request. A token of another room gets `403`, whatever its identity, as for every other operation on that room.
- The embedded commands `participantHandRaise` and `participantHandLower` are not affected: the meeting always calls with the token of its own room.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `raise-hand`: "Raise or lower the own hand" limits the permission-free path to a room member token of that room, with a scenario for a token of another room.

## Impact

- REST API: `participantHandUpdate` (public) answers `403` instead of `200` to a room member token of another room. The OpenAPI already lists `403`; no contract change.
- Webhooks: no `participantHandChanged` is sent for a room the token does not belong to.
- Embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: `withRoomPermissionForOthers` in `meet-ce/backend/src/middlewares/room.middleware.ts`.
- openvidu.io: none (`docs/meet/features/meetings/raise-hand.md` already says a room member token acts as that participant).

## Decisions to confirm

- Delivery: private advisory or regular public pull request. Proposed: regular public pull request, since raise hand is new in 3.10.0 and no released version has the flaw.
- A token of another room acting on its own identity gets `403`. Alternative: `404` (participant not in the meeting of the token's room); `403` matches the `permissions` scenario "Token of another room".

## Source

3.10.0 pre-release audit, finding IM-3 (low, verified-live), introduced by #109.
