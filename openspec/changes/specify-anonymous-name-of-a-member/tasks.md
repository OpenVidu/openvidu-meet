# Tasks

## 1. Decide

- [ ] 1.1 Record the maintainer's choice between options A and B in `proposal.md`, then write the delta spec it implies (`specs/meetings/spec.md` for A) and drop `skip_specs`.

## 2. Implement the chosen option

- [ ] 2.1 Option A: in the reservation of `meet-ce/backend/src/services/participant-name.service.ts`, treat the name of a member or identified guest of the room as held by that identity. Verified in `tests/integration/api/meetings/participant-name.service.test.ts` (real Redis): an anonymous "Guest Bea" joining first is named "Guest Bea_1" and the member keeps "Guest Bea".
- [ ] 2.2 Option B: mark identified participants in the participants panel and tiles of `shared-meet-components`, with i18n keys in every language bundle; verified in a Karma spec of the participant model and a Playwright check in `meet-ce/frontend/e2e/participants.test.ts`.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: one `Fixed` or `Improved` line under the unreleased release once the option is chosen (behavior shipped in 3.10.0 is the name lock itself, so check whether the line of that feature is amended instead).
- [ ] 3.2 openvidu.io: the page that documents joining and names, after the decision.
