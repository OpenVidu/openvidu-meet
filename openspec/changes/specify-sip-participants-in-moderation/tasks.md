# Tasks

## 1. Decide

- [ ] 1.1 Record the maintainer's choice in `proposal.md` and, for option A, write the delta specs and drop `skip_specs`; for option B, close the change as decided with no code.

## 2. Option A

- [ ] 2.1 Replace the "kind is standard" test of `isStandardParticipant` and `getStandardParticipant` (`meet-ce/backend/src/services/livekit.service.ts`, `meeting.service.ts`) by an explicit list of hidden kinds. Verified in `tests/unit/services/livekit.service.test.ts` and `meeting-mute.test.ts` with a SIP participant listed, kicked and muted while recorders and agents still answer `404`.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none today (no observable change in the Community edition); revisit when SIP lands.
- [ ] 3.2 openvidu.io: none until the decision is taken.
