# Tasks

Paths below are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.

## 1. Dismiss a refusal apart from the failures

- [ ] 1.1 In `services/broadcast/broadcast-state.service.ts`, add `dismissRefusal()`, which clears the refusal and leaves the broadcasts as they are; `dismissFailure()` keeps clearing both. Verify in `services/broadcast/broadcast-state.service.spec.ts` that dismissing a refusal keeps a failed broadcast with its error.
- [ ] 1.2 In `components/panel/activities-panel/broadcast-activity/broadcast-activity.component.ts`, make `addedDestinationEffect` call `dismissRefusal()` instead of `dismissFailure()`, and add the handler the banner's Dismiss calls. In `broadcast-activity.component.html`, render that Dismiss in the failure banner whenever `requestError()` is defined outside the `failed` phase; in the `failed` phase the existing Dismiss stays.
- [ ] 1.3 Verify in `broadcast-activity.component.spec.ts` (created by `test-broadcast-activity-component`; create it here if this change lands first): while live to A, a refused start of B shows the banner with Dismiss, and dismissing it removes the banner while A stays live; while live to A with B `failed` with "Connection refused", a destination added for the meeting and refused leaves B `failed` with its error. Run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.

## 2. Spec

- [ ] 2.1 Update requirements of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md`: in "Controlling each destination while live", a refused request is shown with a dismiss whatever the phase, with a scenario "Refusal while live" (GIVEN a meeting live to destination A; WHEN the server refuses a moderator's start of B; THEN the activity shows the refusal with a dismiss, and dismissing it leaves A live); in "Destinations added in the meeting", a scenario "Refused destination next to a failed one" (GIVEN a meeting live to A whose broadcast to B failed; WHEN the server refuses a destination added while live; THEN B still shows as failed with its error). If `add-live-broadcast` is already archived, write them instead as a `MODIFIED` delta of `live-broadcast` in this change and drop `skip_specs`.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own, and its entry does not describe this behavior.
- [ ] 3.2 openvidu.io: none.
