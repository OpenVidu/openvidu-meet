# Tasks

## 1. Reject an absent sender

- [ ] 1.1 In `sendParticipantReaction` of `meet-ce/backend/src/services/meeting.service.ts`, replace the room lookup by `getStandardParticipant(roomId, participantIdentity)` (one LiveKit call) and answer `403` when the sender is absent while the meeting runs, `404` when no meeting runs. Verified in `meet-ce/backend/tests/integration/api/meetings/reaction.test.ts` with a join token that never connected (`403`, no data packet sent), and a unit case for the missing meeting if a unit file covers the service (needs the OpenVidu local deployment for the integration case; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. Reactions are new in 3.10.0 (#117).
- [ ] 2.2 openvidu.io: none.
