# Design

## Context

- `MeetingService.kickParticipant` removes the participant from LiveKit and nothing else (`meeting.service.ts:131`).
- A demotion already revokes a participant's tokens: `ParticipantTokenRevocationService.revokeIssuedTokens(roomId, identity)` writes the revocation time in Redis for the token lifetime, and a token carries in its metadata the revocation it was issued after (`issuedAfterRevocation`), so an earlier token is told from a later one without comparing replica clocks.
- The token currency check refuses a revoked token on requests that authenticate with it (`token.service.ts:177`); a previous token passed to the token endpoint is only checked for its signature and room (`room-member.service.ts:624`), so a kicked participant can still mint a token through their link, which is the intended way back, and `LivekitWebhookService.removeSessionWithRevokedToken` removes a session that joined with one before `participantJoined` is sent, marking it so its `participantLeft` is suppressed.

## Goals / Non-Goals

**Goals:**
- A kicked participant cannot reconnect, or join the room's next meeting, with a token issued before the kick.

**Non-Goals:**
- Blocking: the participant may come back through their link at once.
- Kicks done by removing a member or withdrawing `meetingJoin`, whose tokens the currency check already invalidates.

## Decisions

- `kickParticipant` calls `revokeIssuedTokens` before removing the participant from LiveKit, so a reconnection racing the kick already finds the revocation. No new key, no new code path: removal of the reconnection and refusal of the token are the demotion's.
- The revocation is keyed by room and identity, like the demotion's. An anonymous participant gets a new identity from their link anyway; a member or a user keeps theirs, and the token minted for them afterwards carries the new revocation, so it is accepted.

## Risks / Trade-offs

- [Several replicas] → The revocation lives in Redis and the check runs on whichever replica serves the token request or receives `participant_joined`.
- [A revocation that cannot be written] → The kick fails before removing the participant and answers `500`, rather than kicking without revoking.
- [The revocation written but the removal failing] → The participant stays connected with revoked metadata until the moderator retries; their next request fails the currency check and the meeting client recovers through its regenerate fallback (`room-member-context.service.ts:187`), as after a demotion.
- [`optimize-participant-kick` edits the same method] → Whichever lands second rebases onto the other; the revocation stays the first step.
- [A member kicked and then demoted, or the reverse] → One revocation key per identity holds the latest time; both actions only need tokens issued before them refused.
