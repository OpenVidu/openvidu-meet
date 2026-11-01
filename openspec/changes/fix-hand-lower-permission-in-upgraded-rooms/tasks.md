# Tasks

## 1. Settle who is notified of raised hands

- [ ] 1.1 Record the answer to the open product question in `proposal.md` (Option A or B) and delete the option not taken from What Changes and from these tasks.
- [ ] 1.2 Option B only: add a delta that modifies `raise-hand` "Holders of participantHandLower are notified of raised hands" (notice and sound for holders of `participantHandLower` and for participants with the moderator role; Lower hand only with the permission; a scenario with a moderator of a room created before 3.10.0), remove `skip_specs: true` from `.openspec.yaml`, and verify with `npx openspec validate fix-hand-lower-permission-in-upgraded-rooms --strict`.

## 2. Notify moderators without the permission (Option B only)

- [ ] 2.1 In `meeting-event-handler.service.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/`), make `handleParticipantAttributesChanged` announce a raised hand when the local participant holds `participantHandLower` or their member badge is moderator, and make `handNoticePermissionEffect` dismiss the notice only when both are gone. Verify with cases in `meeting-event-handler.service.spec.ts`: a moderator without the permission gets the sound and the notice, a speaker without it gets neither.
- [ ] 2.2 In the same service, offer the notice's Lower hand action only while the local participant holds `participantHandLower`. Verify in `meeting-event-handler.service.spec.ts` that the notice shown to a moderator without the permission carries no action, and run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.
- [ ] 2.3 Add to `meet-ce/frontend/e2e/participants.test.ts` a room whose moderator role denies `participantHandLower`: a moderator sees the notice of a speaker's raised hand without Lower hand; run `./meet.sh test-e2e-frontend` (needs the OpenVidu local deployment; report as not run when unavailable).

## 3. Release surfaces

- [ ] 3.1 In the raise hand entry under `## 3.10.0 (unreleased)` > `### Added` > `#### Integration` of `CHANGELOG.md`, replace "with the `participantHandLower` permission to lower other participants' hands" with "with the `participantHandLower` permission, granted to the moderator role of rooms created from this release on, to lower other participants' hands" (Option A adds "and to be notified when one goes up" after "hands"). No new line: raise hand is new in 3.10.0. If the `Upgrade notes` alternative is chosen instead, add there: "Rooms created before 3.10.0 keep a moderator role without `participantHandLower`."
- [ ] 3.2 openvidu.io `docs/meet/features/meetings/raise-hand.md` (branch `next`): Option A, none (the "Lowering other participants' hands" section already says that rooms and members created before start without the permission). Option B, the paragraph of "Following the queue" that begins "Participants who can lower hands also hear a sound" says that moderators are notified too and that the notice offers Lower hand only to participants with `participantHandLower`.
