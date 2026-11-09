# Tasks

Requires `add-realtime-channel` on the branch.

## 1. Frontend renames

- [ ] 1.1 Rename, in `shared-meet-components`, with their specs and imports:
  - `MeetingLobbyService` → `MeetingJoinService`, `MeetingLobbyComponent` → `MeetingJoinComponent` (selector `ov-meeting-join`);
  - the `LOBBY.*` translation keys → `JOIN.*` in every locale;
  - the `lobby` `data-testid`s → `join`, in the SPA e2e, the webcomponent e2e and the testapp;
  - `MeetingWaitingPanelComponent` → `MeetingAlonePanelComponent` (`ov-meeting-alone-panel`) with its customization slot, also in `meet-pro/` when present.

  Verify the frontend unit suite, `./meet.sh lint-frontend` and `./meet.sh lint-webcomponent` pass with no other diff.

## 2. Contracts

- [ ] 2.1 Add to the typings, each with TSDoc:
  - `MeetLobbyConfig` and `MeetRoomConfig.lobby` (`message` up to 500 characters);
  - `lobbyBypass` and `lobbyAdmin`;
  - `MeetLobbyParticipant` (`knockDate`, `away`);
  - `lobbyStatus` and `lobbyWaitId` on `MeetRoomMemberTokenMetadata`;
  - `MeetSignalType.LOBBY_UPDATED` with its payload (`roomId`, `version`);
  - `MeetWebhookEventType.PARTICIPANT_KNOCKED` and `LOBBY_STATUS_CHANGED` with their payloads.

  Verify the typings build and the backend unit tests `permission-aliases` and the entity-field suites.
- [ ] 2.2 Add the embedded commands `lobbyAdmit`, `lobbyReject`, `lobbyAdmitAll` and `lobbyRejectAll` (`@permission lobbyAdmin`), and the events `participantKnocked`, `lobbyUpdated` and `lobbyStatusChanged` (`waiting`, `admitted`, `rejected`, `left`, `ended` with `reason`, `queuePosition`). No alias: replace the note about a future `lobbyKnocked`/`participantKnocked` alias in `meet-ce/typings/CLAUDE.md`. Verify the embedded API contract test, `api-registry.test.ts` and `scripts/lint-api-naming.mjs`.
- [ ] 2.3 Document in the OpenAPI:
  - `config.lobby`;
  - `lobbyBypass` and `lobbyAdmin` (schema and the full-permission examples);
  - `MeetLobbyParticipant`;
  - `lobbyList`, `lobbyResolve` and `lobbyResolveAll` (`participantIdentities`, `409` when the admissions do not fit);
  - the `403` of `meetingGet`, `participantList`, `participantGet`, `broadcastList` and `broadcastGet` in rooms with the waiting room on;
  - the `participantKnocked` and `lobbyStatusChanged` webhooks;
  - the waiting credential outcome (`409` full, `429` pause) of the internal `generateRoomMemberToken` and the internal `GET /meetings/{roomId}/lobby/me`.

  Verify `redocly lint`, the API naming lint and `openapi-permission-examples.test.ts`.

## 3. Room config, permissions and migrations

- [ ] 3.1 Validate and store `config.lobby` (Zod create and update with the default `{ enabled: false }`, Mongoose schema, the switch rule). Verify with the unit schema tests and the integration tests `create-room` and `update-room-config` (default, `422` without `enabled`, `422` for 501 characters, `409` during a meeting).
- [ ] 3.2 Add `lobbyBypass` and `lobbyAdmin` across the permission checklist:
  - `UNALIASED_PERMISSION_DEFAULTS` `false`;
  - the fields lists and `MEET_PERMISSION_KEYS`;
  - `allPermissions` and `noPermissions`;
  - default roles (moderator `true`, speaker `false`);
  - Zod and Mongoose schemas;
  - console `PERMISSION_GROUPS` under a "Waiting room" group ("Join without waiting", "Admit participants") in every locale.

  Verify the unit tests that assert whole permission objects and the Karma `permissions.model.spec.ts`.
- [ ] 3.3 Migrate rooms v9 → v10 (`config.lobby`, normalized permissions, both permissions granted to the moderator role) and room members v6 → v7 (granted to moderator members without an override), bumping both schema versions and `MIGRATION_REV`s per `meet-ce/backend/src/migrations/README.md`. Verify with the unit migration tests and the integration tests `room-migrations` and `room-member-migrations`.

## 4. Server

- [ ] 4.1 Split `generateTokenForJoiningMeeting` into named steps and three explicit modes (join, admission, refresh), extract `createParticipantIdentity`, and add the waiting gate:
  - a waiting credential has identity, the token issue of `getTokenIssue`, no video grant, `lobbyStatus` and `lobbyWaitId`;
  - nothing is reserved, created or counted;
  - a previous waiting credential is answered by its wait (admitted → join token in admission mode; waiting → renewed credential; rejected less than 15 s ago → `429`; ended or expired → new wait id).

  Verify with unit tests of the modes and the gate, including a member with a demotion revocation, and the integration tests in `meetings`:
  - the room stays `open` and no `meetingStarted` webhook is sent;
  - a LiveKit connection with the waiting credential is refused;
  - a full meeting still lets a participant wait;
  - admission joins with the same identity and starts the meeting.
- [ ] 4.2 Implement `LobbyService` state:
  - the Redis keys (entries, presence, version, `lobby_rooms`, `lobby_ended:<waitId>`, cooldown);
  - one Lua script per change (knock with the 100 limit, replacement of a wait of the same identity, admit with the capacity check, reject, leave, away, return to the line, expiry, end, config off), each increasing the version;
  - list ordering;
  - `lobbyResolveAll` over the given identities, all or nothing for admissions.

  Verify with unit tests over a fake Redis and an integration test with two app instances as two replicas (admit and reject at once: one `200`, one `404`; two admissions for the last place: one `200`, one `409`).
- [ ] 4.3 Add the admission register (`meeting_admitted:<roomId>:<roomSid>`):
  - written by the `register` step of the join and admission modes;
  - deleted by `handleRoomFinished`;
  - enforced in `handleParticipantJoined` for standard participants;
  - cleared for the identity by `kickParticipant`;
  - checked by `withRoomPermission('meetingRead')` in rooms with the waiting room on.

  Verify with integration tests: a kicked participant reconnecting with their old token is removed; an old join token in the next meeting is removed; an admitted member joining again skips the wait; `meetingGet`, `participantList` and `broadcastList` answer `403` to a waiting credential and to a token of a link holder who never asked, and `200` to an admitted participant.
- [ ] 4.4 Register the realtime handler:
  - presence on open, `lobby_seen` heartbeat every 10 s for local waiting connections;
  - immediate removal on close codes `4000` and `1001`;
  - per-waiter `lobby.state` with `waitId`, `queuePosition`, `waitedSeconds`, `hostPresent` and `message`;
  - final states recorded and resent on reconnection and on channel resync.

  Add the internal `GET /meetings/{roomId}/lobby/me` and the 15 s sweep (away at 30 s, admitted entries back to the line at 60 s, expiry at 5 minutes) through `TaskSchedulerService`. Verify with unit tests driving the clock through the scheduler, and with integration tests (realtime suite of `add-realtime-channel`) for:
  - knock, leave, page closed, away, return and expiry;
  - reconnection keeping the place, and a replica stop with reconnection through the other replica;
  - a second wait of the same identity taking over the first;
  - polling with the realtime connection refused;
  - one `participantKnocked` webhook per wait.
- [ ] 4.5 Serve `lobbyList`, `lobbyResolve` and `lobbyResolveAll` in `meeting.routes.ts` with `withRoomPermission('lobbyAdmin')`, a thin controller and request validators. Send `meet_lobby_updated` (version) to the `lobbyAdmin` holders of the meeting after each change, to a joiner holding `lobbyAdmin` in `handleParticipantJoined`, and to a participant who gains `lobbyAdmin` in `updateParticipantRole`. Recompute `hostPresent` on the meeting's participant webhooks and on role changes. Send `lobbyStatusChanged` webhooks for every change after the knock. Verify with the integration tests `meetings` (codes `200`, `403`, `404`, `409`, `422`, order, empty list, skipped identities) and `meeting-security`, and unit tests of `livekit-webhook.service` and `frontend-event.service`.
- [ ] 4.6 End and return waits:
  - `meetingEnd` (every surface) and the duration limit record `lobby_end_reason:<roomId>`, and `handleRoomFinished` ends the waits with `meeting_ended` only when it exists, and otherwise returns admitted entries to the line;
  - `room_closed` when the room actually closes or is deleted, in the idle paths and when `handleRoomFinished` applies a scheduled `meetingEndAction`;
  - everyone let in when `updateMeetRoomConfig` turns `lobby.enabled` off, and the new `lobby.message` sent to the waiters when it changes.

  Verify with integration tests of each path (a meeting that empties keeps the waits; closing during a meeting ends them only when it ends) and the `webhook` suite (`participantKnocked` once, `lobbyStatusChanged` statuses, room-scoped filter honored).

## 5. Meeting UI: the participant who waits

- [ ] 5.1 Create `domains/meeting/waiting-room/` with `WaitingRoomService` and add the `waiting` phase:
  - the device setup button reads "Ask to join" when the participant would wait;
  - a waiting credential keeps the device setup tracks and opens `RealtimeConnectionService` with `maxDelayMs` 5 s, falling back to polling `lobby/me` every 5 s after 10 s without a connection;
  - `admitted` requests the token in admission mode and connects without reloading, closing the realtime connection once connected, and returns to `waiting` on failure;
  - the waiting credential is renewed before expiry instead of the in-meeting refresh;
  - "Leave waiting room", `meetingLeave` and removing the element close with `4000`;
  - the tab title shows the position and "You're in", and an admission while the page is hidden joins with the microphone off;
  - the embedded command gate accepts `mediaToggleAudio`, `mediaToggleVideo` and `meetingLeave` while waiting;
  - every check of the `prejoin` phase reviewed for `waiting`.

  Verify with Karma specs of the meeting view, `WaitingRoomService`, `embedded-command.service` and `room-member-context.service`.
- [ ] 5.2 Build, as separate library components following the canvas and translated in every locale:
  - the waiting screen (position as the title, time waited, message, shorter camera preview, "The host hasn't joined yet", quiet "Leave waiting room", phone layout);
  - the rejected, left, replaced, ended and "waiting room full" screens with "Ask to join again" where it applies (disabled during the 15 s pause) and the end screen's dismiss button.

  Emit `lobbyStatusChanged` for every state and never `meetingLeft` for a wait. Verify with Karma component specs and the webcomponent Jest tests of the event payloads.

## 6. Meeting UI: holders of lobbyAdmin

- [ ] 6.1 Add `LobbyAdminService` in `domains/meeting/waiting-room/`:
  - fetch `lobbyList` on a higher `meet_lobby_updated` version (grouped within 300 ms), on joining, after a LiveKit reconnection and on gaining `lobbyAdmin`, honoring server-sent packets only;
  - derive `lobbyUpdated`, and `participantKnocked` from new `(participantIdentity, knockDate)` pairs after the first list;
  - run the four commands through the REST operations with the identities of the list held.

  Verify with Karma specs of the service and the command handler.
- [ ] 6.2 Build, as separate library components:
  - the "Waiting to join" panel section, with rows marking who is away, the free places, Deny all, "Admit N" (disabled when they do not fit) and the Deny all confirmation dialog;
  - the status rail chip at the right end, in amber tint;
  - the notification below the rail with two actions, grouped with View, one grouped notification on joining with people waiting, only while the panel is closed and dismissed by opening it (`ov-notification` gains a second action);
  - decrypted or masked names in encrypted rooms.

  Translate everything in every locale. Verify with Karma component specs (`status-rail.component`, panel, notification).

## 7. Console wizard

- [ ] 7.1 Add the Waiting room section to the Room Access step (switch, and the message field shown while it is on) and the "Join without waiting" and "Admit participants" switches per role, in create and edit mode, translated in every locale. Verify with Karma specs of `room-access.component` and the SPA e2e suite `room-wizard`.

## 8. End-to-end

- [ ] 8.1 Add SPA e2e cases:
  - knock → admit (same identity, devices kept);
  - knock → deny → ask again after the pause (end of the line);
  - leave, and page closed;
  - position updates;
  - the time waited kept across a reload;
  - "The host hasn't joined yet" until a moderator joins;
  - the host losing the connection without ending the waits;
  - the last free place: one admitted, the next admission refused;
  - notification only with the panel closed;
  - Deny all with confirmation;
  - the meeting ended by a moderator while waiting;
  - a kicked participant removed when reconnecting with the old token.
- [ ] 8.2 Add webcomponent e2e cases, on both integrations (element and iframe):
  - `lobbyStatusChanged` sequences;
  - `lobbyUpdated` on joining and on changes, and `participantKnocked` for new knocks only;
  - the four commands with and without `lobbyAdmin`;
  - `meetingLeave` and `mediaToggleVideo` while waiting;
  - the `participantKnocked` and `lobbyStatusChanged` webhooks through the bridge.

  Run the suites against the local deployment, headless, or report them as not run.

## 9. Release surfaces

- [ ] 9.1 Add the lines under the unreleased release of `CHANGELOG.md`:
  - Added > Integration: the waiting room on the REST API, the webhooks and the embedded API, with `config.lobby`, `lobbyBypass`, `lobbyAdmin`, `lobbyList`, `lobbyResolve`, `lobbyResolveAll`, `participantKnocked`, `lobbyStatusChanged`, `lobbyUpdated`, `lobbyAdmit`, `lobbyReject`, `lobbyAdmitAll` and `lobbyRejectAll`; in rooms with it on, `meetingGet`, `participantList`, `participantGet`, `broadcastList` and `broadcastGet` require admission or `lobbyBypass`;
  - Added > UI: the waiting screen, the admitters' panel section, chip and notification, and the wizard section;
  - Upgrade notes: existing rooms keep the waiting room off, and their moderator role gains `lobbyBypass` and `lobbyAdmin`.
- [ ] 9.2 openvidu.io: write `docs/meet/features/meetings/waiting-room.md` (turning it on, who waits, admitting and rejecting, capacity, what the participant sees, who reads the meeting, embedded API and webhooks) with screenshots, and register it in the navigation.
- [ ] 9.3 openvidu.io: add `lobby` to `docs/meet/features/meetings/configuration.md`.
- [ ] 9.4 openvidu.io: add `lobbyBypass` and `lobbyAdmin` to the predefined roles of `docs/meet/features/rooms/access.md`.
- [ ] 9.5 openvidu.io: list `participantKnocked` and `lobbyStatusChanged` in `docs/meet/embedded/reference/webhooks.md`.
- [ ] 9.6 openvidu.io: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` and the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`.

## Workflow follow-up

- Archive with `/opsx:archive` inside the pull request once every task is done, then run `npx openspec validate --all --strict`.
- After archiving:
  - title the new spec `# Waiting Room Specification` and complete its Purpose with the surfaces and the openvidu.io page;
  - map `lobby` to `waiting-room` in the Purpose of `room-config`;
  - move "Waiting room permissions" next to the other permission groups of `permissions`.
- The design canvas follows these decisions since 2026-11-09 (21 artboards, including joining, back in line, reconnecting, meeting ended, replaced and "waiting room full"); keep it in step if the copy changes during implementation.
- Follow-up outside this change: sounds for a knock (admitters) and for an admission (waiter), with `SoundService`.
- Delete the superseded `MEET-LOBBY-LOCK-ROOM-PLAN.md` and `MEET-LOBBY-LOCK-ROOM-PLAN.es.md` from the repository root.
