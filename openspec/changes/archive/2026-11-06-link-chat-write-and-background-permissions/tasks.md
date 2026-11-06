# Tasks

## 1. Contracts

- [x] 1.1 Extend the TSDoc of `chatWrite` and `mediaChangeVirtualBackground` in `meet-ce/typings/src/database/room-member-permissions.ts` with "Only effective together with `chatRead`" / "`mediaPublishVideo`", in the wording `broadcastEdit` uses; verify with `./meet.sh build-typings`.
- [x] 1.2 Extend the same two descriptions in `meet-ce/backend/openapi/rooms/schemas/meet-permissions.yaml`; verify with `./meet.sh build-rest-api-doc` building without errors.

## 2. Server: chat grant needs chatRead

- [x] 2.1 Make `buildPublishGrant` in `meet-ce/backend/src/services/room-member.service.ts` grant `canPublishData` only with `config.chat.enabled`, `chatRead` and `chatWrite`; verify by extending `tests/unit/services/room-member-grant.test.ts` (chatWrite without chatRead denied, both granted allowed) and running `./meet.sh test-unit-backend`.
- [x] 2.2 Cover the live path: an `updateRoomMember` that revokes only `chatRead` from a member in the meeting pushes a grant without `canPublishData`, in the existing room-member integration tests that already assert `canPublishData` (`generate-room-member-token.test.ts`, and the member-update one that checks the live grant); run them against the local deployment, or report them as not run.
- [x] 2.3 Run `./meet.sh lint-backend` and verify it passes.

## 3. Meeting: no background effects without the camera permission

- [x] 3.1 In `FeatureCalculator.applyPermissions` (`shared-meet-components`, `rooms/utils/features.utils.ts`), offer backgrounds only with `mediaChangeVirtualBackground` and `mediaPublishVideo`; verify with a case in `features.utils.spec.ts` and `./meet.sh test-unit-frontend`.
- [x] 3.2 Add an e2e case to `meet-ce/frontend/e2e/permissions.test.ts` next to the `canChangeVirtualBackground` ones: a participant granted the background permission but denied `mediaPublishVideo` sees no backgrounds control on the device setup screen nor in the meeting; run it, or report it as not run.

## 4. Console: dependent toggles in both forms

- [x] 4.1 In `room-members/models/permissions.model.ts`, add `dependsOn: 'chatRead'` to `chatWrite` and `dependsOn: 'mediaPublishVideo'` to `mediaChangeVirtualBackground`, moving the latter right after `mediaPublishVideo`; extend `permissions.model.spec.ts` to assert the three dependencies and that each dependent item sits in its parent's group.
- [x] 4.2 Add the idempotent dependency sync function to the room-members domain (design decision 3) with a unit spec (parent off disables, parent on enables, a locked key stays disabled, values kept), and make `room-access.component.ts` use it instead of its per-parent subscriptions, keeping the feature constraints winning.
- [x] 4.3 Make `member-form.component.ts` call the sync on its permissions `valueChanges` and after every programmatic reset or prefill, and show the disabled-reason tooltip the wizard shows for a dependent toggle (adding the translation to the room-members locale files if that domain cannot resolve the wizard's key).
- [x] 4.4 Append the "Needs ..." suffix to the descriptions of `chatWrite` (needs "Read") and `mediaChangeVirtualBackground` (needs "Publish video") in the ten `room-members/lang/*.json` files, following each locale's `broadcastEdit` wording.
- [x] 4.5 Extend `meet-ce/frontend/e2e/room-wizard.test.ts` with the two new dependencies (switching off `chatRead` disables `chatWrite`, switching off `mediaPublishVideo` disables `mediaChangeVirtualBackground`, both keep their value and come back); run it, or report it as not run.
- [x] 4.6 Run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend` and verify both pass.

## 5. Release surfaces

- [x] 5.1 Add one `Improved` line to the 3.10.0 section of `CHANGELOG.md`: `chatWrite` lets a participant send chat messages only together with `chatRead`, and `mediaChangeVirtualBackground` only applies together with `mediaPublishVideo`; the room wizard and the member form disable each switch while the one it needs is off.
- [x] 5.2 On openvidu.io `next`, update the note in `docs/meet/features/rooms/access.md` that says no permission is implied by another: values stay independent, but sending chat messages needs reading the chat, the virtual background needs publishing video, and adding broadcast destinations needs broadcast control.

## Workflow follow-up

- Archive the change inside the pull request that implements it, then run `npx openspec validate --all --strict`.
