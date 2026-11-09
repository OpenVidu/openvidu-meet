# Tasks

Implemented first: `add-waiting-room` depends on it, since a kicked participant's join token still names the meeting it was minted for.

## 1. Server

- [x] 1.1 In `MeetingService.kickParticipant`, call `ParticipantTokenRevocationService.revokeIssuedTokens(roomId, identity)` before removing the participant from LiveKit, failing the kick if the revocation cannot be written. Document in the OpenAPI of `participantKick` that the participant's earlier tokens stop working. Verify with unit tests of `meeting.service` and integration tests: a kicked participant reconnecting with their old token is removed with no `participantJoined` or `participantLeft` webhook; a REST request with their old token fails the currency check; the same token in the room's next meeting is removed; a new token from their link joins. Rebase on `optimize-participant-kick` if it lands first.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`, Fixed > Integration of the unreleased release: a kicked participant could reconnect with the token they held for up to 2 hours; `participantKick` now makes their earlier tokens stop working.
- [x] 2.2 openvidu.io (`next`): in `docs/meet/features/meetings/moderation.md`, state that a kicked participant comes back only through their link.
