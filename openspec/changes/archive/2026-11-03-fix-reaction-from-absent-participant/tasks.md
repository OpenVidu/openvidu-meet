# Tasks

## 1. Reject an absent sender

- [x] 1.1 In `sendParticipantReaction` of `meet-ce/backend/src/services/meeting.service.ts`, look the sender up (`getStandardParticipant`) next to the room config, both alongside the active-meeting room lookup, and answer `403` when the sender is absent while the meeting runs, `404` when no meeting runs. Verified in `meet-ce/backend/tests/integration/api/meetings/reaction.test.ts` with a join token that never connected (`403`, no data packet sent); the existing "once the meeting has ended" case keeps the `404`, and no unit file covers the service (needs the OpenVidu local deployment for the integration case; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no new line. Reactions are new in 3.10.0 (#117).
- [x] 2.2 openvidu.io: none.
