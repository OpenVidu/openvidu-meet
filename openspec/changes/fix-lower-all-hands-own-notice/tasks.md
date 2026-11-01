# Tasks

## 1. Attribute the caller's own hand to the participant

- [ ] 1.1 In `lowerAllHands` (`meet-ce/backend/src/services/meeting.service.ts`), pass `MeetEventOrigin.PARTICIPANT` to `setHand` for the hand whose identity is `requestSessionService.getParticipantIdentity()` and `MeetEventOrigin.MODERATOR` for every other, so an API key call (no identity) keeps every hand a moderator action. Update the method's TSDoc, which says "as a moderator action".
- [ ] 1.2 Extend "should lower every raised hand as a moderator action" in `meet-ce/backend/tests/integration/api/meetings/hand.test.ts` (or add a case next to it): a moderator with a raised hand calls `participantHandLowerAll` with their joining token; the spied `sendParticipantHandChangedWebhook` receives `origin` `participant` for the moderator and `moderator` for the speakers (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable). Run `./meet.sh test-unit-backend` and `./meet.sh lint-backend`.
- [ ] 1.3 No meeting code changes: the case "tells the local participant when a moderator lowered their hand, and only then" of `meeting-event-handler.service.spec.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/`) already shows that a local lower with `origin` `participant` brings no notice. Confirm it end to end by extending the Lower all hands case of `meet-ce/frontend/e2e/participants.test.ts` with the moderator's own hand up: the moderator sees no "A moderator lowered your hand" while each speaker does; run `./meet.sh test-e2e-frontend` (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. Raise hand is new in 3.10.0 and its entry does not describe attribution.
- [ ] 2.2 In the `participantHandLowerAll` description of `meet-ce/backend/openapi/meetings/meetings.yaml` ("Lowers every raised hand in the current meeting as a moderator action: each affected participant sees that a moderator lowered their hand"), say that the caller's own hand is reported as lowered by the participant and every other one as a moderator action; the `participantHandLowerAll` TSDoc in `meet-ce/typings/src/embedded/commands.ts` says nothing about attribution and stays. Regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` on the openvidu.io `next` branch.
- [ ] 2.3 openvidu.io: no page besides the regenerated REST API reference of 2.2.
