# Tasks

Paths are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.

## 1. Dismiss only the refusal

- [ ] 1.1 In `services/broadcast/broadcast-state.service.ts` add `dismissRefusal()` that only unsets the refusal, and call it instead of `dismissFailure()` from the effect in `components/panel/activities-panel/broadcast-activity/broadcast-activity.component.ts` (around line 306) that handles the refusal of an added destination. Verify in `services/broadcast/broadcast-state.service.spec.ts`: after `dismissRefusal()` the kept failed broadcasts and their errors are still there, and `dismissFailure()` still clears them.
- [ ] 1.2 Add the component case to `broadcast-activity.component.spec.ts` (created by `test-broadcast-activity-component`; create it here if this change lands first): live to A with B failed, the server refuses an added destination; B's row stays failed with its error. Run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.

## 2. Spec

- [ ] 2.1 Update requirement "Destinations added in the meeting" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` with a scenario "Refused destination leaves other failures" (GIVEN a meeting live to A with B failed; WHEN a destination is added and the server refuses it; THEN B still shows its failure and error).

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own.
- [ ] 3.2 openvidu.io: none.
