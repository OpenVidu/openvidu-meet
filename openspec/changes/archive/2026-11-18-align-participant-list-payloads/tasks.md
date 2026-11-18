# Tasks

## 1. Typings (main session)

- [x] 1.1 Move `MeetWaitingParticipantType` from `meet-ce/typings/src/database/room-member.entity.ts` to `meet-ce/typings/src/response/participant-response.ts` as `MeetParticipantType`, same values, TSDoc covering both a participant in the meeting and one waiting; no deprecated alias.
- [x] 1.2 Add `type?: MeetParticipantType` to `MeetParticipantPayload`, with TSDoc saying it is absent for a participant that did not join through Meet, and `role: MeetRoomMemberRole` to `MeetWaitingParticipant` (`meet-ce/typings/src/response/waiting-participant-response.ts`), with TSDoc saying it is the role the participant asked to join with and that the join takes the role their credential gives then.
- [x] 1.3 Add to the typings the pure functions `participantTypeOf({ memberId, userId })` (user first, then member, else anonymous) and `participantRoleOf(badge)` (`OTHER` or none is speaker, any other badge moderator), with TSDoc, exported from the package index. Cover both in `meet-ce/backend/tests/unit/typings/` (Jest maps the typings source), moving there the "who asks" cases of `waiting-participant-admission.policy.test.ts` and the `extractRole` cases of `participant.helper.test.ts`.
- [x] 1.4 Rename every use of `MeetWaitingParticipantType` in `meet-ce/backend` and `meet-ce/frontend` (sources and tests, listed by `grep -rln MeetWaitingParticipantType meet-ce`) and add `role` to every `MeetWaitingParticipant` literal in sources and tests (many never name the enum; `pnpm run test:types` in `meet-ce/backend` and the `shared-meet-components` build list them), so the workspace builds; `./meet.sh build-typings` and `./meet.sh verify`.

## 2. Backend

- [x] 2.1 `MeetParticipantHelper.toParticipantPayload()` (`meet-ce/backend/src/helpers/participant.helper.ts`) sets `type` with `participantTypeOf()` when the participant's Meet metadata parses and omits it otherwise; `extractRole()` uses `participantRoleOf()`. Cover both in `meet-ce/backend/tests/unit/helpers/participant.helper.test.ts` (user, identified guest, anonymous, no Meet metadata, a promoted anonymous participant keeps `type`).
- [x] 2.2 `WaitingParticipantAdmissionPolicy` drops its own `participantTypeOf()` for the typings one; `RoomMemberService.generateTokenForJoiningMeeting()` passes `role: participantRoleOf(tokenMetadata.badge)` in the knock request; `WaitingKnockRequest` carries it, `WaitingParticipantService.knock()` writes it into the stored participant next to `type`, which it takes from the typings' `participantTypeOf()`, and `toParticipant()` in `waiting-participant.service.ts` copies it out. Update `waiting-participant-admission.policy.test.ts` and `waiting-participant.service.test.ts`.
- [x] 2.3 OpenAPI (`meet-ce/backend/openapi/`): a shared schema `meetings/schemas/meet-participant-type.yaml`, whose description covers a participant in the meeting and one waiting, referenced by `webhooks/schemas/meet-participant-payload.yaml` (optional `type`) and `meetings/schemas/meet-waiting-participant.yaml` (required `type`, replacing the inline enum); `role` in `meet-waiting-participant.yaml`, with the description of decision 3; `role` in the example of `get-waiting-participants.yaml` and in the `waitingParticipantKnocked` and `waitingParticipantStatusChanged` examples of `webhooks/webhooks.yaml`; in `meetings/responses/success/get-meeting-participants.yaml` the sentence that participants come in no particular order and an example with `type`. `pnpm run lint:api` in `meet-ce/backend`.
- [x] 2.4 Integration tests, in the existing domain files: `tests/integration/api/meetings/get-meeting.test.ts`, `participantList` and `participantGet` return `type` `anonymous` for a participant joined with the anonymous speaker link, `identified_guest` for a member's personal link and `user` for a user's account; `tests/integration/api/meetings/waiting-participants.test.ts`, the scenarios "Shared link" (`role` `speaker`), "Moderator link" and "Role changed during the wait" of the `locked-room` delta; `tests/integration/webhooks/webhook.test.ts`, `participantJoined` carries `type` and `waitingParticipantKnocked` carries `role`. Backend integration suite, needs the OpenVidu local deployment through `./meet.sh stack`; report as not run when it is unavailable.
- [x] 2.5 `./meet.sh verify`.

## 3. Frontend

- [x] 3.1 `toEmbeddedParticipantPayload()` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/utils/embedded-participant.utils.ts`) sets `type` with `participantTypeOf()` when the participant's Meet metadata parses and omits it otherwise; `toParticipantRole()` is replaced by `participantRoleOf()` at its callers. Cover it in `embedded-participant.utils.spec.ts`.
- [x] 3.2 Webcomponent e2e: in `meet-ce/frontend/webcomponent/tests/e2e/events.test.ts`, the `PARTICIPANT_JOINED / PARTICIPANT_LEFT Events` test that already pairs the event with its webhook checks that both carry `type` `anonymous` (scenario "The webhook and the embedded event agree"). Run them on a stack with `--testapp`; report as not run when the local deployment is unavailable.
- [x] 3.3 `./meet.sh verify`.

## 4. Release surfaces

- [x] 4.1 `CHANGELOG.md`, 3.10.0 `Improved` > `Integration`: one line saying that `participantList`, `participantGet`, the webhooks `participantJoined` and `participantLeft` and their embedded events carry `type`, linking `participantList`. The participant events new in 3.10.0 and the waiting participant's `role` get no line: they are new in 3.10.0.
- [x] 4.2 openvidu.io (`next`): regenerate the REST API reference with `./meet.sh build-rest-api-doc <abs path of openvidu.io>/docs/meet/embedded/reference/api.html`.
- [x] 4.3 openvidu.io (`next`): regenerate the embedded API reference with `./meet.sh build-webcomponent-doc <abs path of openvidu.io>/shared/meet` (participant and waiting participant events).
- [x] 4.4 openvidu.io (`next`): `docs/meet/features/meetings/locked-room.md`, the `waitingParticipantStatusChanged` example shows `role`.

## Workflow follow-up

- `/opsx:archive` inside the same pull request, then `./meet.sh verify --only openspec --all`.
