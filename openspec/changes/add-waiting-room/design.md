# Design

## Context

What the code does today (`main` at `aadd48de6`):

- **Join path.** `RoomMemberService.generateRoomMemberToken` (`meet-ce/backend/src/services/room-member.service.ts:375`) builds the token metadata and, for `joinMeeting`, calls `generateTokenForJoiningMeeting` (:468). That method runs, in order:
  1. room closed → `409`;
  2. no `meetingJoin` → `403`;
  3. no name → `400`;
  4. `maxParticipants` → `409`, counting the participants connected to LiveKit (`countStandardParticipants`);
  5. builds the identity (`memberId || userId`, else `slug(name)-uid(15)`) and stamps the token issue (`getTokenIssue`);
  6. `reserveUniqueName`;
  7. `createLivekitRoom`, which starts the meeting through the `room_started` webhook and sets LiveKit's own `maxParticipants`.

  A previous token passed as bearer contributes its identity, and a known identity switches the method into **refresh mode** (`isRefresh = !!participantIdentity`, :486): steps 3 to 7 are skipped and the participant must already be connected to LiveKit (`applyPermissionsToLiveParticipant`, :546). The same JWT is the Meet token and the LiveKit token; a token without `joinMeeting` has no `sub` and no video grant. Once `sub` is set, the currency check also looks for a demotion revocation of that identity (`token.service.ts:177`).
- **Tokens in the browser.** `RoomMemberContextService` keeps the token in memory only and schedules the in-meeting refresh for any token with `sub`. A reload starts from the link again: an anonymous participant gets a new identity.
- **Kick.** `kickParticipant` only removes the participant from LiveKit (`meeting.service.ts:131`). Their join token stays valid for LiveKit for up to 2 h, also for the next meeting of the same room.
- **Reads.** `meetingGet`, `participantList`, `participantGet`, `broadcastList` and `broadcastGet` require `meetingRead`, which the default speaker role grants. A token without `joinMeeting` carries the same permissions as a join token.
- **Server to client.** `FrontendEventService.sendSignal` is a LiveKit data packet in the meeting room, with an `onlyIfRoomExists` option because a send to a missing room times out after seconds. `LivekitWebhookService.handleParticipantJoined` already replays the recording and broadcast state to a joiner.
- **Config and room status.** `updateMeetRoomConfig` answers `409` for any field while a meeting is active (`room.service.ts:248`). `updateMeetRoomStatus` to `closed` during a meeting only schedules the close for the meeting's end (`room.service.ts:318-341`); room deletion does the same. Rooms are at schema v9 and room members at v6. `participantHandLower` set the precedent of a migration step that grants a permission to the moderator role (`room-migrations.ts:135`).
- **Meeting end.** LiveKit closes the room 20 s after the last participant leaves (`MEETING_DEPARTURE_TIMEOUT`) or 20 s after creation if nobody connects (`MEETING_EMPTY_TIMEOUT`). An explicit end (`meetingEnd`) and the duration limit delete the room through the API.
- **Locks.** `MutexService.withLock` returns `null` at once when the lock is taken; it does not wait.
- **Frontend.**
  - `MeetingViewPhase` is `loading | prejoin | connecting | live | disconnected | error`. The join is `tokenProvider()` → `_applyToken` → `_connectToRoom`.
  - The embedded command gate runs `mediaToggleAudio` and `mediaToggleVideo` only in `prejoin` or in a live session (`embedded-command.service.ts:30`, :251).
  - `MeetingLobbyService`, `MeetingLobbyComponent`, the `LOBBY.*` translation keys and the `lobby` test ids are the Join screen. `MeetingWaitingPanelComponent` (`ov-meeting-waiting-panel`) is the "waiting for others" placeholder of a lone participant, also a customization slot used by PRO.
  - `ov-notification` supports one action. `SoundService` plays the meeting-ending-soon sound.
  - After LiveKit refuses a connection, the client reads `meetingGet` to tell a full meeting from another failure (`meeting-livekit.service.ts:250`).
- **Realtime channel.** `add-realtime-channel` provides `RealtimeService` (server) and `RealtimeConnectionService` (browser). Messages are addressed by room and identity, delivered on any replica, kept alive by a heartbeat, and each feature sends its current state on connection open and when a replica's subscription comes back.

## Goals / Non-Goals

**Goals:**
- A waiting participant never holds a credential that reaches the media server (phase 6 acceptance criterion), and a participant who was not let in never stays in the meeting, whatever token they hold.
- The waiting list is replica-safe, survives a replica's death, tolerates short and mobile disconnections, and drops abandoned waits on its own.
- Admission reuses the join path, so names, identity and meeting start behave as for any join, and it never admits more participants than fit.
- The deferred token plus the in-place switch from waiting to connected is a seam breakout rooms can reuse: a participant is told on the realtime channel to request a token for another room and switches without reloading.

**Non-Goals:**
- Blocking, ban lists, an in-meeting switch, chat with waiting participants, a PIN lock (`config.lock`).
- Sounds for a knock and for an admission: pending, tracked as a follow-up.
- `MoveParticipant`: the LiveKit fork does not implement it, and nothing here needs it.
- Notifying admitters through the realtime channel. They are already connected to LiveKit, and a second connection per moderator buys nothing yet.
- Restricting recordings in rooms with a waiting room: recordings belong to the room, not to the meeting, and keep their own permissions.

## Decisions

### The waiting credential

When `config.lobby.enabled` holds, the computed permissions lack `lobbyBypass` (admins and the owner hold every permission), and the identity is not in the running meeting's admission register (see below), `generateTokenForJoiningMeeting` runs steps 1 to 3, builds the identity (extracted as `createParticipantIdentity`), and answers with a **waiting credential**:

- `TokenService.generateRoomMemberToken` with `participantIdentity` set, so `sub` exists for the realtime channel, the token issue of `getTokenIssue` (otherwise a member demoted in the last two hours would be refused by the currency check), and **no video grant**: LiveKit refuses to connect a token without `roomJoin`. It is never sent to LiveKit; the participant asks for their LiveKit token once admitted.
- Metadata `lobbyStatus: 'waiting'`, a fresh `lobbyWaitId` (random, one per wait, kept when the credential is renewed) and the token's own permissions.
- No `reserveUniqueName`, no `createLivekitRoom`, no capacity count.
- The knock itself (see "Knock, presence and expiry") happens in the same request.

The response stays `{ token }`. The client reads `lobbyStatus` from the token metadata, as it already reads the permissions.

### Three modes of the join request

The refresh mode keyed on a known identity cannot serve an admission: an admitted participant is not connected to LiveKit yet. The join path becomes three explicit modes over shared named steps:

| Mode | Chosen when | Steps |
| --- | --- | --- |
| **Join** | no previous token with identity | `assertRoomOpen → assertCanJoin → assertName → identity → [waiting gate] → assertCapacity → reserveName → ensureMeetingRoom → register → mint` |
| **Admission** | the previous token is a waiting credential whose wait is `admitted` | `assertRoomOpen → assertCanJoin → identity, name and correlation fields from the credential → assertCapacity (not counting its own pending admission) → reserveName → ensureMeetingRoom → register → mint` |
| **Refresh** | the previous token carries an identity connected to the meeting | as today |

`register` adds the identity to the meeting's admission register when the room has the waiting room on (see below). A waiting credential whose wait is not `admitted` gets:

| Wait of the `lobbyWaitId` | Response |
| --- | --- |
| `waiting` | A fresh waiting credential with the same identity and `lobbyWaitId`. This is idempotent and is also how the client renews before the 2 h expiry. |
| ended by a rejection less than 15 s ago | `429`, so a rejected participant cannot knock again at once. |
| ended, or expired | A waiting credential with the same identity and a new `lobbyWaitId`: "Ask to join again" is a new wait at the end of the line. |

Alternatives considered:
- Sending the LiveKit token over the realtime channel on admission saves one request, but the token would have to be kept in Redis to resend it after a lost message, and the join checks would run when admitting instead of when joining.
- The earlier "lock room" design is replaced; see the realtime channel design.

### State in Redis, changed by atomic scripts

Keys (prefix `ov_meet:`):

- `lobby:<roomId>`: hash, identity → JSON `{ participantIdentity, participantName, externalId?, metadata?, knockDate, waitId, status: 'waiting' | 'admitted', admittedAt? }`.
- `lobby_seen:<roomId>`: hash, identity → last-seen epoch ms. It is separate so presence refreshes do not rewrite entries.
- `lobby_version:<roomId>`: counter, increased by every change.
- `lobby_ended:<waitId>`: the outcome of a wait that ended with a rejection, a replacement, or with the meeting or room (`rejected`, `replaced`, or `ended` plus its reason), with a TTL of the token lifetime, so a client that missed the message learns it on reconnection instead of knocking again.
- `lobby_cooldown:<roomId>:<identity>`: set by a rejection, TTL 15 s.
- `lobby_rooms`: set of room ids with a non-empty list, for the sweep.
- `meeting_admitted:<roomId>:<roomSid>`: set of the identities admitted to that meeting (the admission register), TTL 24 h as a backstop.

Every change (knock, replacement, admit, reject, leave, away, expiry, return to the line, end, room close and config off) is one Lua script over the room's keys that checks the entry, applies the change and increases the version atomically. "The first decision wins, the later one answers `404`" therefore holds across replicas without a distributed lock: a burst of thirty knocks at the start of a class is thirty short scripts, never thirty contenders for one lock. Notifications go out after the script; the version orders them. Reads (`lobbyList`) run no script.

The order is `knockDate` and then identity, sorted in the application. A list holds at most 100 entries.

### Knock, presence and expiry

- **Knock:** the request that mints a waiting credential runs the knock script. With no entry for the identity, it creates one (`knockDate = now`), adds the room to `lobby_rooms`, starts the presence lease, and the replica sends the `participantKnocked` webhook. The script refuses a knock when 100 participants wait (`409`, "The waiting room is full" screen). Creating the knock in this request rather than when the realtime connection opens means a waiter whose network blocks WebSockets is still in the list, and polling can serve them.
- **Same identity:** a knock for an identity that already waits, from another tab or device or after a reload, replaces the existing wait: the new `waitId` takes over the entry and keeps its `knockDate`, the old `waitId` is recorded as ended with `replaced`, and the old connection receives `ended` with reason `replaced` and is closed. No webhook is sent: the same participant is still waiting. Every `lobby.state` carries its `waitId`, and a client ignores states of another wait.
- **Presence:** `lobby_seen` is refreshed by the knock, when a realtime connection with the credential opens, every 10 s by each replica for its local waiting connections (one pipeline), and by each poll.
- **Leaving:** a connection closed with `4000` (the client's "Leave waiting room") or `1001` (the browser closed the page or navigated away) removes the entry at once. A reload therefore never leaves a ghost: the new page knocks again, and for an identified participant the new knock is a replacement anyway.
- **Away and expiry:** a sweep (`TaskSchedulerService`, once per cluster) runs every 15 s over `lobby_rooms`:
  - an entry unseen for 30 s is shown as `away` to the admitters, and keeps its place;
  - an `admitted` entry that has not joined 60 s after `admittedAt` returns to `waiting`, with its `knockDate` (see "Admission");
  - an entry unseen for 5 minutes is removed, as `expired`.

  A phone that goes to the background, a network change or a sleeping laptop thus keeps the place for five minutes. A client that comes back after that knocks again at the end of the line.

### What the waiter receives

One message type, `lobby.state`:

```
{ waitId, status: 'waiting' | 'admitted' | 'rejected' | 'ended', queuePosition?, waitedSeconds?, hostPresent?, message?, reason? }
```

- **On open** of a realtime connection, and on every resync of the channel, the server sends the current state of that wait: `waiting` with its position, `admitted`, or the recorded outcome of `lobby_ended:<waitId>` followed by a close.
- **On every list change** each waiter whose position changed gets its own `queuePosition`. These are per-identity messages, so no waiter ever receives another one's identity.
- **`hostPresent`** means that some participant of the meeting room holds `lobbyAdmin` in its metadata permissions. It is recomputed on knock, on `participant_joined` and `participant_left` of the meeting room, and when a participant's role changes, while `lobby_rooms` contains the room, and is `false` without a meeting. The waiting screen says "The host hasn't joined yet" while it is `false`: a fact also when an integrator's backend admits through REST.
- **`waitedSeconds`** is the time since `knockDate`, computed by the server when it sends a `waiting` state, so the client's clock never matters; the client counts on from it locally. It comes from `knockDate`, so a replacement or a return to the line keeps it.
- **`message`** is resent to every waiter when `updateMeetRoomConfig` changes `lobby.message`, which is possible between meetings, while people wait.
- **When the wait ends without a decision**, the server records `lobby_ended:<waitId>`, sends `ended` with `reason` `meeting_ended`, `room_closed` or `replaced`, and closes the connection with `1000`.
- **Rejection** records `lobby_ended:<waitId>`, sets the cooldown, sends `rejected`, and closes with `1000`.

`left` never comes from the server: the client knows it left. The embedded `lobbyStatusChanged` maps one to one, with `left` raised locally.

**Polling fallback.** When the realtime connection has not opened within 10 s, the waiting service polls `GET /internal-api/v1/meetings/{roomId}/lobby/me` every 5 s with the waiting credential, which answers the same `lobby.state` and refreshes presence, and keeps trying the realtime connection in the background; polling stops once it opens. While waiting, the realtime client caps its reconnection delay at 5 s, so a short outage never outlasts the 30 s before the waiter shows as away.

### Admission

- **Capacity.** A meeting's occupancy is the participants connected to it plus the `admitted` entries that have not joined yet. The admit script receives the connected count, read from LiveKit just before, and refuses with `409` when the admissions would exceed `maxParticipants`. A bulk admission is all or nothing: if not everyone fits, nobody is admitted and the admitter chooses. A participant joining without waiting (`lobbyBypass`, or already admitted) is checked against the same occupancy. The panel shows the free places, and the "Admit N" button and the row Admit buttons are disabled when they do not fit. LiveKit's own `maxParticipants` stays the hard limit for the small window between the count and the connection.
- **Admitting** sets the entry to `admitted`, sends `admitted` to the waiter and the `lobbyStatusChanged` webhook, and the waiter's client requests its join token in admission mode. The entry stays `admitted` until `participant_joined` reports that identity in the meeting, which removes it. The client keeps its realtime connection open until it is connected to LiveKit and then closes it.
- **Failures:**

  | What fails | Outcome |
  | --- | --- |
  | The join request answers that the meeting is full | The entry returns to `waiting` at once, with its `knockDate`, and reappears in the admitters' list. The waiter sees the waiting screen again. |
  | The join request fails on the network or the server, LiveKit refuses or cannot be reached, or the admitted participant does not join within 60 s | The client retries once, then shows the waiting screen again. The entry returns to `waiting` with its `knockDate` when the 60 s pass, and the waiter is told through `lobby.state`. |
  | The room was closed meanwhile | The wait ends with `ended`, reason `room_closed`, and the "Closed room" screen. |
  | Access was withdrawn meanwhile (link disabled, member deleted, `meetingJoin` denied) | The wait ends and the access error screen of that case is shown. |
  | The tab was closed after admission | The presence rules apply: away, then back in line after 60 s, then expired after 5 minutes. |

### The admission register

`meeting_admitted:<roomId>:<roomSid>` holds every identity that received a join token for that meeting in a room with the waiting room on, whether it was admitted or joined without waiting. It is written by the `register` step, after `ensureMeetingRoom` returns the LiveKit room and its sid, and deleted by `handleRoomFinished` for that sid. It is never persisted beyond the meeting: every meeting starts with an empty register.

- **Enforcement.** `handleParticipantJoined`, for a standard participant (recorders and agents excluded) of a room with the waiting room on, removes from LiveKit any identity that is not in the register. A join token is only minted after the waiting gate, so this catches a token reused after a kick, or carried over to the next meeting of the room within its 2 h lifetime.
- **Kick.** `kickParticipant` removes the identity from the register before removing the participant, so a kicked participant must ask again to come back.
- **Joining again.** An identity in the register joins directly, without waiting, until the meeting ends: an admitted member who reloads or joins from another device is not sent back to the line.
- **Reads.** In a room with the waiting room on, the reads gated by `meetingRead` (`meetingGet`, `participantList`, `participantGet`, `broadcastList`, `broadcastGet`) also require an API key, a token whose holder holds `lobbyBypass`, or a token whose identity is in the running meeting's register; otherwise `403`. The admitted participant's own read of `meetingGet` after a refused connection keeps working, because the `register` step runs before the token is minted. The check lives in `withRoomPermission('meetingRead')`, so every read gated by that permission follows it.

### Ending waits

- **Explicit end.** `meetingEnd` (REST, meeting UI, embedded command) and the duration limit record `lobby_end_reason:<roomId>` before deleting the LiveKit room. `handleRoomFinished` ends every wait with `meeting_ended` only when that record exists.
- **A meeting that empties** (the last participant lost the connection or left, and the 20 s departure timeout passed) ends without that record: the waits stay, and `admitted` entries return to `waiting` with their `knockDate`, since their admission belonged to the meeting that ended. A host whose laptop sleeps therefore finds everyone still waiting when they come back.
- **Room closed or deleted.** `endAll(roomId, 'room_closed')` runs when the room becomes closed or is deleted, not when the request arrives: in the idle path of `updateMeetRoomStatus` and of room deletion, and in `handleRoomFinished` when it applies a scheduled `meetingEndAction` of `close` or `delete`.
- **Config turned off.** `updateMeetRoomConfig`, when it turns `lobby.enabled` from true to false (only possible without a meeting), removes every entry and tells each waiter `admitted`. Their clients request a normal join token, since the gate no longer applies, and face the usual checks.

### What admitters receive

`MeetSignalType.LOBBY_UPDATED` (`meet_lobby_updated`), sent after every change to the identities of the meeting room whose permissions carry `lobbyAdmin`, with `onlyIfRoomExists`:

```
{ roomId, version }
```

The signal only says that the list changed. The client fetches `lobbyList` when it receives a higher version (several signals within 300 ms make one request), after a LiveKit reconnection, when it joins, and when it gains `lobbyAdmin`. The list therefore travels once per change per admitter, by REST, whatever its size; a data packet carrying the list with each participant's metadata (up to 2 KB) would reach the data channel's 64 KB message limit with about thirty waiters.

- `handleParticipantJoined` sends the current version to a joiner holding `lobbyAdmin`.
- `updateParticipantRole`, when the new permissions grant `lobbyAdmin`, sends the current version to that participant at once, and recomputes `hostPresent` for the waiters.

The client derives from consecutive lists:
- the `lobbyUpdated` embedded event, on the first list after joining and on every list that differs;
- `participantKnocked` (event and notification) for each `(participantIdentity, knockDate)` pair that was not in the previous list. The first list after joining is the baseline: it raises one grouped notification ("3 waiting to join") when not empty, and no `participantKnocked`;
- the chip, the panel and the free places from the list itself.

`MeetSignalType` handlers already ignore packets that did not come from the server (`meetings`, "Server signals are honored only from the server").

Room metadata (a native LiveKit event) is rejected because every participant, not only admitters, would read the names.

### REST, webhooks, embedded API

- **Routes** in `meeting.routes.ts`:
  - `GET /:roomId/lobby` (`lobbyList`);
  - `PUT /:roomId/lobby/:participantIdentity` (`lobbyResolve`, body `{ action: 'admit' | 'reject' }`);
  - `PUT /:roomId/lobby` (`lobbyResolveAll`, body `{ action, participantIdentities }`, applied to the listed identities that still wait; the others are skipped).

  All three use `withAuth(apiKeyValidator, roomMemberTokenValidator)`, `withValidRoomId` and `withRoomPermission('lobbyAdmin')`. `lobbyResolve` answers the resolved `MeetLobbyParticipant`; `lobbyResolveAll` answers `{ participants }`, the ones it resolved. An admission that does not fit answers `409`.
- **Internal route** in `internalMeetingRouter`: `GET /:roomId/lobby/me`, accepting only the waiting credential, answers its `lobby.state`.
- **Webhooks:**
  - `participantKnocked`: once per wait, when it starts, with `roomId`, `roomName` and the participant.
  - `lobbyStatusChanged`: each later change of a wait, with `status` `admitted`, `rejected`, `left`, `expired`, `ended` (with `reason`), or `waiting` when an admitted participant returns to the line. A replacement sends none.
- **Embedded commands** call the same REST operations from the meeting UI. They are gated by `lobbyAdmin` on the client (`@permission`) and on the server. `lobbyAdmitAll` and `lobbyRejectAll` take no argument: the element sends the identities of the list it holds.
- **Embedded events:** `participantKnocked` and `lobbyUpdated` to the hosts of `lobbyAdmin` holders, `lobbyStatusChanged` to the waiter's host. There is no `lobbyKnocked` and no alias: the alias machinery stays as it is, `meet-ce/typings/CLAUDE.md` drops its note about a future `lobbyKnocked`/`participantKnocked` alias, and the phase 6 plan's charter exception is superseded.
- **Commands while waiting:** the command gate gains the `waiting` phase. `mediaToggleAudio` and `mediaToggleVideo` act on the preview as on the device setup screen, and `meetingLeave` leaves the waiting room (close `4000`, `lobbyStatusChanged` `left`). The other commands are rejected as before joining.
- **Typings:**
  - `MeetRoomConfig.lobby` (`MeetLobbyConfig`);
  - `lobbyBypass` and `lobbyAdmin`;
  - `MeetLobbyParticipant extends MeetParticipantPayload { knockDate: number; away: boolean }`;
  - `MeetRoomMemberTokenMetadata.lobbyStatus?` and `lobbyWaitId?`;
  - the signal and its payload, the two webhook types and payloads, and the commands and events with payloads.

### Permissions and migrations

`lobbyBypass` and `lobbyAdmin` go through the participant-permission checklist:

- the typings interface;
- `UNALIASED_PERMISSION_DEFAULTS`: `false`, which is the token completion;
- `MEET_ROOM_MEMBER_PERMISSIONS_FIELDS` and `MEET_PERMISSION_KEYS`;
- `allPermissions()` and `noPermissions()`;
- the default roles (moderator `true`, speaker `false`, both);
- the Zod and Mongoose schemas;
- the OpenAPI schema and the full-permission examples;
- the console `PERMISSION_GROUPS` (a "Waiting room" group with "Join without waiting" and "Admit participants") and every locale.

Like every permission, they are independent: `lobbyAdmin` without `lobbyBypass` is valid, and its holder waits before admitting others.

Migrations:

- **Rooms v9 → v10:** add `config.lobby = { enabled: false }`, normalize permissions, and grant `lobbyBypass` and `lobbyAdmin` to the moderator role (the `participantHandLower` step is the model).
- **Room members v6 → v7:** grant both to members with the moderator role and no override.
- Bump `ROOM_SCHEMA_VERSION`, `ROOM_MEMBER_SCHEMA_VERSION` and both `MIGRATION_REV`s.

### Frontend

- **Renames first** (no behavior change):
  - `MeetingLobbyService` → `MeetingJoinService`, `MeetingLobbyComponent` → `MeetingJoinComponent` (`ov-meeting-join`);
  - the `LOBBY.*` translation keys → `JOIN.*` in every locale, and the `lobby` test ids → `join`, in the SPA e2e, webcomponent e2e and testapp;
  - `MeetingWaitingPanelComponent` → `MeetingAlonePanelComponent` (`ov-meeting-alone-panel`), with its customization slot, in CE and in PRO.

  "Lobby" and "waiting" in code then mean only the waiting room.
- **Modules.** The waiting room lives in `domains/meeting/waiting-room/`, one piece per standalone library component, each exported through the barrels and composed by the meeting through the customization seam, so PRO can replace any one of them:
  - `WaitingRoomService` (credential renewal, realtime or polling, state);
  - `LobbyAdminService` (versioned list, derived events, commands);
  - waiting screen;
  - outcome screens (rejected, left, ended, waiting room full);
  - panel section with the free places, the bulk strip and the confirmation dialog;
  - status rail chip at the right end;
  - notification below the rail. `ov-notification` gains a second action.
- **New phase.** `waiting` sits between `prejoin` and `connecting`. `_requestTokenAndConnect` checks the token:
  - a waiting credential sets the phase to `waiting`, keeps the local tracks of device setup, and opens `RealtimeConnectionService` with `maxDelayMs` 5 s, falling back to polling;
  - on `admitted`, it calls `tokenProvider` again with the credential as the previous token, then runs `_applyToken` → `_connectToRoom` as today, and closes the realtime connection once connected;
  - on a failed admission it returns to `waiting`.

  Every check of `phase() === 'prejoin'` is reviewed for the new phase.
- **Token refresh.** `RoomMemberContextService` does not schedule the in-meeting refresh for a waiting credential. Instead the waiting service renews it 60 s before expiry and reconnects the channel with it.
- **Teardown.** Removing the element or leaving while waiting closes the realtime connection with `4000`.
- **Background tab.** While waiting, `document.title` carries the position ("(2) Waiting · <room>") and "You're in" once admitted, restored on leaving the phase. An admission that arrives while `document.visibilityState` is `hidden` joins with the microphone off, overriding the initial media state for that join only.
- **Waiting screen layout.** State and position first (the position is the title), then a quiet line with the time waited ("Waiting 4 min", from the first minute on, inside an `aria-live="off"` region so it is never announced), then the room message, then a shorter preview (16:9) with the device controls. "Leave waiting room" is a text button, never a full-width one: leaving loses the place, and a quiet button avoids leaving by mistake without a confirmation dialog.
- **Copy** (canvas, USER-approved, updated 2026-11-08): Ask to join, Waiting to be let in, You're 2nd in line, The host hasn't joined yet, Leave waiting room, You weren't let in, Ask to join again, The waiting room is full, Waiting to join, away, Admit / Deny, Deny all, "Admit 3" (with the count), "2 places left". The wizard says Waiting room, "Join without waiting" and "Admit participants".

### Several replicas

| What | Where it happens | What keeps it correct |
| --- | --- | --- |
| Knock | The replica serving the token request | One script creates the entry; the same replica sends the webhook once |
| A waiter's connection | Any replica | All state is in Redis; any replica resends it on open |
| Admit or reject | Any replica | One script per decision; the realtime channel carries the result to the replica holding the waiter |
| Capacity | The replica admitting | The script counts pending admissions atomically; LiveKit's limit backs the connected count |
| Admission register | The replica minting, and the one receiving `participant_joined` | A Redis set per meeting |
| Admitter signals | The replica that made the change | Sent to LiveKit, which every replica can call; admitters fetch `lobbyList` from any replica |
| Away, return and expiry | The sweep | Runs on one replica per tick |
| A replica dies | Clients reconnect elsewhere | Entries survive in Redis; the 30 s and 5 minute rules cover the gap |

## Risks / Trade-offs

- **[Admitted but never connects (tab closed after admission)]** → The entry returns to the line after 60 s and expires with the presence rules. No name was reserved and no LiveKit room was created until the client asked for its join token.
- **[Capacity between the count and the connection]** → Pending admissions are counted in the script; a participant connecting in the window between LiveKit's count and the script is caught by LiveKit's own `maxParticipants`, and the admitted participant returns to the line.
- **[Admitter signal lost during LiveKit reconnection]** → The client fetches `lobbyList` after reconnection; any later change brings a higher version.
- **[Waiting credential expiry (2 h)]** → Renewed through the token endpoint before expiry, keeping identity and place. A client that sleeps past expiry gets `4401`, renews, and still has its place within the 5 minute rule.
- **[Flood of knocks from a public link]** → The list holds at most 100 participants, a rejected identity waits 15 s before knocking again, and Deny all clears the list. An anonymous attacker can still knock with fresh identities up to the limit; blocking is a non-goal.
- **[Reusing a join token after a kick or in the next meeting]** → The admission register removes the participant on `participant_joined`. The participant sees a connection and a removal, never the meeting's content beyond the first media packets.
- **[Two names: API `lobby`, UI "waiting room"]** → Kept on purpose, like `meeting` and "call" elsewhere. The knock is `participantKnocked`, since it is something a participant does. The frontend renames remove the Join screen meaning.
- **[Load: every list change sends per-waiter messages, one signal and one `lobbyList` per admitter]** → Bounded by the 100-entry list and the 300 ms grouping. A burst like "Admit 3" is one change.
- **[Encrypted rooms]** → Names are the client-encrypted strings, as in `participantJoined`. The panel decrypts them with the viewer's key like the participant list does.

## Migration Plan

Rooms and members migrate forward at startup (v10, v7). Rolling back to a version without the waiting room is unsupported, like any schema bump ("Replicas run one version"); waiters connected during the upgrade reconnect and keep their place within the 5 minute rule. Requires `add-realtime-channel` to be deployed in the same release.
