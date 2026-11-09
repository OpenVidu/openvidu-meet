# Proposal

## Why

A kick only disconnects the participant from LiveKit (`meeting.service.ts`). The room member token they held stays valid for up to 2 hours, so a kicked participant can reconnect with it at once, or join the room's next meeting with it, without going through their link again. A moderator who kicks someone expects them out until they come back the way anyone does.

## What Changes

- Kicking a participant revokes every room member token issued to them until then, through the revocation a demotion already uses (`ParticipantTokenRevocationService`).
- A reconnection with one of those tokens is removed at once, without a `participantJoined` or `participantLeft` webhook, by the existing removal of sessions with a revoked token.
- Requests authenticated by one of them fail the currency check, as a demoted moderator's do.
- The participant comes back by opening their link again, which issues a new token.

This holds in every room. `add-waiting-room` depends on it: there, a join token names the meeting it was minted for, and only this revocation stops a kicked participant's token. It is implemented first (USER, 2026-11-09).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-moderation`: a kick ends the kicked participant's earlier tokens.

## Impact

- REST API: `participantKick` keeps its contract; the kicked participant's earlier tokens stop working. The OpenAPI description says so.
- Embedded API: `participantKick` (and its alias `kickParticipant`) behave as the REST operation; no contract change.
- Webhooks: no new event; a removed reconnection sends no `participantJoined` or `participantLeft`.
- Meeting UI: the kicked participant's meeting, reconnecting with its old token, is removed again; its "you were removed" screen does not change.
- Console UI and deployment: not affected.
- CE extension seams: none needed.
- openvidu.io: `docs/meet/features/meetings/moderation.md` states that a kicked participant comes back only through their link.
