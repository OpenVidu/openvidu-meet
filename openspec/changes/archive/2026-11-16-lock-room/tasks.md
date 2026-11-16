# Tasks

## 1. Typings

- [x] 1.1 Rename the room config and permissions: `MeetLockedConfig` and `config.locked` (with `MeetLockedConfigOptions`), `lockedBypass` and `lockedAdmin` in `MeetRoomMemberPermissions`; verify with `./meet.sh build-typings`.
- [x] 1.2 Rename the waiting types and values: `MeetWaitingParticipant`, `MeetWaitingParticipantStatus`, `MeetWaitingParticipantReason` (`room_unlocked`), `MeetWaitingParticipantErrorCode` (`waiting_list_full`), the token option `waitingTicket`, the WebSocket message `waitingParticipant.state` without `queuePosition`, the signal `meet_waiting_participant_list_updated`; drop `availablePlaces` and the list wrapper's position semantics; TSDoc updated; verify with `./meet.sh build-typings`.
- [x] 1.3 Rename the webhook events (`waitingParticipantKnocked`, `waitingParticipantStatusChanged`), the embedded events (`waitingParticipantKnocked`, `waitingParticipantListUpdated`, `waitingParticipantStatusChanged`) and commands (`waitingParticipantAdmit`, `waitingParticipantReject` with `{ participantIdentity }`, plus `waitingParticipantAdmitAll` and `waitingParticipantRejectAll`), with their payload types and TSDoc; verify with `./meet.sh build-typings`.

## 2. Backend: data and Redis model

- [x] 2.1 Change the unreleased migrations rooms v9 to v10 and room members v6 to v7 to write the lock and the new permission keys directly, with no new schema version; unit and migration tests updated.
- [x] 2.2 Rename the defaults, the missing-permission rules and the permission resolver to `lockedBypass` and `lockedAdmin`, and the zod schemas of the room config and permissions; existing unit tests updated and passing.
- [x] 2.3 Move `services/waiting-room/` to `services/waiting-participants/` with the class renames of design.md and the new Redis key prefixes; remove the `<prefix>_line:<roomId>` index and `queuePosition` from `presence`; `waiting-room-state` integration test renamed and passing on real Redis.
- [x] 2.4 Make `decide` admit one identity or everyone, all or nobody, and reject exactly one identity; drop list parsing; unit and Redis-state tests for: one admitted, one with no place (`409`), all fit, not all fit (`409`, nobody admitted), reject one.

## 3. Backend: REST and webhooks

- [x] 3.1 Replace the routes, controller and request schemas with the six public operations and the internal `waitingParticipantLeave` of design.md, with the `{ message }` answers (admit all included) and the bulk `{ message, deleted, failed }` answer and the error bodies without `availablePlaces`; integration tests `waiting-participants.test.ts` (renamed from `waiting-room.test.ts`) passing, including two replicas and the bulk rejection (all rejected, partial `400`, `422`, a concurrent single rejection).
- [x] 3.5 Name the bulk rejection `bulkRejectWaitingParticipants` and teach `scripts/lint-api-naming.mjs` the bulk shape (`bulk` + verb + module plural), with the charter in the typings `CLAUDE.md`, `api-registry.ts` and `openapi/README.md`; the lint passes.
- [x] 3.2 Rename the webhook events and the `room_unlocked` reason in `OpenViduWebhookService` and its callers; webhook integration tests passing.
- [x] 3.3 Update the OpenAPI: new paths, operationIds, parameters, request and response files, error schemas, webhook entries, `config.locked`, the two permissions and the permission sentence on every gated operation; `redocly lint` clean.
- [x] 3.4 Update the security and permission integration suites (`meeting-security`, rooms, room members) for the new names; passing against an isolated backend.

## 4. Meeting and console UI (`shared-meet-components`)

- [x] 4.1 Rename the frontend waiting domain and services to the new vocabulary, the HTTP calls to the new routes, the realtime message and signal names; Karma specs updated and passing.
- [x] 4.2 Waiting screen without position: remove the "Nth in line" text and its screen reader announcements; the participant sees that they wait to be let in; Karma specs passing.
- [x] 4.3 Panel: free places computed from `maxParticipants` and the meeting's participants, Admit all disabled when the participants waiting exceed them, the server's `409` shown as "not everyone fits", per-row Admit and Deny calling the one-participant operations; Karma specs passing.
- [x] 4.4 Console wizard and member form: "Locked room" section and permission group, "Join a locked room" and "Admit participants" labels, i18n keys moved to `LOCKED_ROOM.*` and `WAITING_PARTICIPANTS.*` in all ten locales; Karma specs passing.

## 5. Embedded API

- [x] 5.1 Emit the renamed events (without `availablePlaces` and `queuePosition`) and accept the four commands in `EmbeddedCommandService`, the web component and the iframe bridge, `waitingParticipantRejectAll` and Deny all calling `bulkRejectWaitingParticipants` with the list the meeting holds (nothing sent when empty, a `400` not an error); update the testapp commands panel; the embedded API contract test updated and passing.
- [x] 5.2 Web component e2e (`events`, `commands`, `webhooks`) and SPA e2e (`locked-room.test.ts`, renamed) updated for the new names, the all-or-none Admit all and the screens without position; passing headless against the local deployment.

## 6. Release surfaces

- [x] 6.1 `CHANGELOG.md`: rewrite the existing 3.10.0 waiting room entry with the locked room names, operations and events; no Fixed or Breaking line, since the feature is unreleased.
- [x] 6.2 openvidu.io `next`: turn `docs/meet/features/meetings/waiting-room.md` into the locked room page (file, title, nav and redirects), recapture its images that show changed copy (wizard section, panel, waiting screen).
- [x] 6.3 openvidu.io `next`: update the permission, room config, webhook and moderation pages and the troubleshooting line for the new names.
- [x] 6.4 Regenerate the REST reference (`./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`) and the embedded reference (`./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet`), and build the site in strict mode.

## 7. The lock moves to room access

- [x] 7.1 Typings: `MeetRoomLock` as `access.lock` in `MeetRoomAccess` and `MeetRoomLockOptions` as `lock` in `MeetRoomAccessConfig`, `MeetLockedConfig` and `config.locked` removed; permissions `accessBypassLock` and `waitingParticipantAdmin`; module token `access` replacing `locked` in `api-registry.ts`, the typings `CLAUDE.md` charter and the naming lint; verify with `./meet.sh build-typings`.
- [x] 7.2 Backend: defaults, zod and mongoose schemas, `updateMeetRoomAccess` (idle-room filter in the write, `null` removing the message, everyone let in on unlock) and `updateMeetRoomConfig`/`updateIdleRoomConfig` without the lock; the v9 to v10 and v6 to v7 migrations write `access.lock` and the new permission keys, and no v11/v8 migration exists; routes and services renamed; unit and integration tests updated and passing.
- [x] 7.3 OpenAPI: `access.lock` in the room access schemas and the `updateRoomAccess` request, `locked` out of the room config schemas, the two permissions and the permission sentence of each gated operation; `redocly lint` clean.
- [x] 7.4 Frontend: the wizard sends `access.lock`, the meeting reads `room.access.lock`, the member form and the embedded command checks use the new permission keys; Karma specs, e2e and testapp updated.
- [x] 7.5 `CHANGELOG.md` 3.10.0 entries and openvidu.io `next` pages (locked room, room access, permissions, room config) use `access.lock`, `updateRoomAccess`, `accessBypassLock` and `waitingParticipantAdmin`; references regenerated.
- [x] 7.6 `waitingParticipantStatusChanged` for every wait to the participants in the meeting holding `waitingParticipantAdmin`: the signal `meet_waiting_participant_status_changed` addressed to them from the server, relayed as the event; TSDoc, backend unit test, Karma spec, web component e2e, embedded reference and openvidu.io page updated.

## Workflow follow-up

- After archive, delete the emptied `openspec/specs/waiting-room/`, write the Purpose of `openspec/specs/locked-room/`, and retitle the scenarios of other capabilities that still say "waiting room", and drop `waitingRoom` from the Purpose of `openspec/specs/room-config/` and add `access.lock` to that of `openspec/specs/room-access/`.
