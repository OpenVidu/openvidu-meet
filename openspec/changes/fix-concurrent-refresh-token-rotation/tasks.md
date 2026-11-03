# Tasks

## 1. Decide and apply

- [ ] 1.1 Record the decision of open product question 5. For option A, write the delta of `authentication` "Refresh the access token" (full requirement, with scenarios for the grace window on one replica and on two replicas) and remove `skip_specs`; add a short `design.md` for the stored pair, its lifetime and its Redis key.
- [ ] 1.2 Option A: in `claimRefreshToken` of `meet-ce/backend/src/controllers/auth.controller.ts`, answer a repeat inside the window with the stored pair. Verify with unit cases that mock the clock collaborator (no real waits) and an integration case in `meet-ce/backend/tests/integration/api/auth/` (two simultaneous exchanges both answer `200` with one pair; needs the OpenVidu local deployment, report as not run when unavailable).
- [ ] 1.3 Option B: document in the openvidu.io console page that multi-tab use needs HTTPS (secure context); no code.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. The single-use refresh token is new in 3.10.0 (#130), so this fix belongs to that feature's entry; amend the line "a rotated refresh token is accepted once" only if option A changes its wording.
- [ ] 2.2 openvidu.io: per the decision (see 1.3); regenerate the REST API reference only if the OpenAPI changes.
