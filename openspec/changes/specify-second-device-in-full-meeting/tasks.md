# Tasks

## 1. Decide

- [ ] 1.1 Record the maintainer's choice in `proposal.md`, then write the delta spec it implies and drop `skip_specs`.

## 2. Implement the chosen option

- [ ] 2.1 Option A: in the participant count of `generateTokenForJoiningMeeting` (`meet-ce/backend/src/services/room-member.service.ts`), do not count a participant whose identity equals the joining member or user. Verified in `tests/unit/services/room-member-permissions.test.ts` (or the nearest unit file) and in the meetings integration tests with `maxParticipants` 1 (needs the OpenVidu local deployment; report as not run when unavailable).
- [ ] 2.2 Option B: correct the scenario "Same member in a second tab" in the delta spec and the openvidu.io page; no code.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: option A, one `Fixed` line under `#### Integration` of the unreleased release (the refusal exists since earlier releases); option B none.
- [ ] 3.2 openvidu.io: the participant-limit page, after the decision.
