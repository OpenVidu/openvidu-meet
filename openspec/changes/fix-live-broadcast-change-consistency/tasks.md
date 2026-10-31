# Tasks

All paths are in `openspec/changes/add-live-broadcast/`; these tasks are done on that change, not here.

## 1. Correct the change

- [ ] 1.1 In `proposal.md` (Impact, REST API) replace "five new operations" with "four new operations" naming `broadcastStart`, `broadcastList`, `broadcastGet` and `broadcastStop`.
- [ ] 1.2 In `specs/live-broadcast/spec.md` delete the scenario "Six destinations" of requirement "Room destinations" (it contradicts "any number of destinations", the scenario "Sixth broadcast" and the 2026-10-21 decision), unless `limit-broadcast-destinations` introduces a cap, in which case rewrite it with the decided limit.
- [ ] 1.3 Run task 8.3 (backend integration suites `room-migrations`, `start-recording` and `webhook`, SPA e2e `room-wizard`, webcomponent broadcast e2e) on the rebased branch against the OpenVidu local deployment and tick it; report as not run when the deployment is unavailable.

## 2. Archive inside the PR

- [ ] 2.1 After every other `fix-broadcast-*` task that updates the delta has landed, run `/opsx:archive add-live-broadcast`, then `npx openspec validate --all --strict`, so `openspec/specs/live-broadcast/` exists when the PR merges.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none, documentation of an unreleased feature.
- [ ] 3.2 openvidu.io: none.
