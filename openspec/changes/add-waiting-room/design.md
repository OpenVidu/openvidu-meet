# Design

## Context

What the code does today (`main` at `f18e47f23`):

- **Join path.** `RoomMemberService.generateRoomMemberToken` (`meet-ce/backend/src/services/room-member.service.ts:375`) builds the token metadata and, for `joinMeeting`, calls `generateTokenForJoiningMeeting` (:468). That method runs, in order:
  1. room closed → `409`;
  2. no `meetingJoin` → `403`;
  3. no name → `400`;
  4. `maxParticipants` → `409`, counting the participants connected to LiveKit (`countStandardParticipants`);
  5. builds the identity (`memberId || userId`, else `slug(name)-uid(15)`) and stamps the token issue (`getTokenIssue`);
  6. `reserveUniqueName`;
  7. `createLivekitRoom`, which starts the meeting through the `room_started` webhook and sets LiveKit's own `maxParticipants`.

  A previous token passed as bearer switches the method into **refresh mode** for a participant connected to LiveKit (:486). `refreshRoomMemberToken` (:582) is the in-meeting timer's refresh. The same JWT is the Meet token and the LiveKit token; a token without `joinMeeting` has no `sub` and no video grant, but carries the role's permissions.
- **Tokens in the browser.** `RoomMemberContextService` keeps the token in memory only. A reload starts from the link again: an anonymous participant gets a new identity.
- **Kick.** `revoke-tokens-on-kick` (merged, #208) makes a kicked participant's earlier tokens stop connecting and fail the currency check; `fix-refresh-of-revoked-session` stops refresh mode from re-stamping a revoked session, or one older than the room's `rolesUpdatedAt`, into a valid one.
- **Room-level invalidation.** `updateRoomRoles` and `updateRoomAccess` stamp the room's `rolesUpdatedAt` (`room.service.ts:365`, :443), and the currency check refuses a room member token issued before it (`token.service.ts:188`). `updateMeetRoomConfig` stamps nothing (`room.service.ts:248-277`).
- **Request credentials.** The meeting client attaches its current room member token to every request from a room page (`room-member-header-provider.service.ts:29-49`) and stores each token the token request answers (`room-member-context.service.ts:171`); on leaving, it drops it (`room-member-context.service.ts:336`).
- **Permissions of a request.** Every permission check of a room member token resolves its permissions through `RoomAccessService.getAuthenticatedRoomMemberPermissions` (`room-access.service.ts:36`), including the routes that check by hand (`recording.middleware.ts:233`), except `applyRecordingListAccessFilters` (`recording.middleware.ts:137`), which reads `recordingList` from the token directly; task 4.3 routes it through the resolver. The validator already loads the room, `config` included. The routes that check no permission but need an identity (the captions assistant, `ai-assistant.routes.ts:16`; a participant's own hand, `room.middleware.ts:177`) only accept a token with `sub`.
- **Config writes.** `updateMeetRoomConfig` checks for an active meeting (`room.service.ts:251`), but `RoomRepository.updateConfig` writes unconditionally (`room.repository.ts:94`), unlike `updateIdleRoomStatus`.
- **Server to client.** `FrontendEventService.sendSignal` is a LiveKit data packet in the meeting room, with an `onlyIfRoomExists` option because a send to a missing room times out after seconds.
- **Config and room status.** `updateMeetRoomConfig` answers `409` for any field while a meeting is active (`room.service.ts:248`). `updateMeetRoomStatus` to `closed` during a meeting only schedules the close for the meeting's end (`room.service.ts:318-341`); room deletion does the same. Rooms are at schema v9 and room members at v6. `participantHandLower` set the precedent of a migration step that grants a permission to the moderator role (`room-migrations.ts:135`).
- **Meeting end.** LiveKit closes the room 20 s after the last participant leaves (`MEETING_DEPARTURE_TIMEOUT`) or 20 s after creation if nobody connects. An explicit end (`meetingEnd`, `meeting.controller.ts:54-77`) and the duration limit (`meeting-duration-limit.service.ts:240-267`) delete the room through the API.
- **Scheduled tasks.** `TaskSchedulerService` locks each run for `max(interval - 1 min, CRON_JOB_LOCK_TTL)` (`task-scheduler.service.ts:84`), 59 s for any task shorter than a minute; `MutexService` releases the lock when a run ends and extends it while it runs (`mutex.service.ts:42-61`), so that duration only matters when a holder dies.
- **Frontend.**
  - `MeetingViewPhase` is `loading | prejoin | connecting | live | disconnected | error`. The join is `tokenProvider()` → `_applyToken` → `_connectToRoom`.
  - The embedded command gate runs `mediaToggleAudio` and `mediaToggleVideo` only in `prejoin` or in a live session (`embedded-command.service.ts:30`, :251).
  - `MeetingLobbyService`, `MeetingLobbyComponent`, the `LOBBY.*` translation keys and the `lobby` test ids are the Join screen. `MeetingWaitingPanelComponent` (`ov-meeting-waiting-panel`) is the "waiting for others" placeholder of a lone participant, also a customization slot used by PRO.
  - `ov-notifications` supports one action (`NotificationOptions.action`). After LiveKit refuses a connection, the client reads `meetingGet` to tell a full meeting from another failure (`meeting-livekit.service.ts:250`).
- **Realtime channel.** `add-realtime-channel` provides `RealtimeService` (server) and `RealtimeConnectionService` (browser). A feature registers how a connection is authenticated and addressed; messages reach every connection of an address on any replica, and each feature recovers on its own from a lost message.

## Goals / Non-Goals

**Goals:**
- Waiting is not a token: a waiting participant holds no credential that reaches the media server or the meeting's API, and a participant who was not let in never acts on the meeting.
- Mint once: the waiting room touches tokens only where the join token is minted. An admission is used there, and refresh, regenerate and kick stay as on `main`. The admission keeps counting as a taken place until LiveKit reports the participant in the room, for a minute at most.
- A place in line belongs to a live connection: the line holds only participants whose meeting client is in touch with Meet, and drops the others on its own.
- The waiting list is replica-safe and survives a replica's death.
- Admission reuses the join path, so names, identity, meeting start and the participant limit behave as for any join.

**Non-Goals:**
- Keeping a place through a reload, a long disconnection or a phone in the background for more than a minute.
- Binding an admission to one meeting: a join token keeps working for the room until it expires, as every join token does today.
- Reserving a place in the meeting for an admitted participant: admitted entries count as taken places only to decide whom to admit, until the participant joins or a minute passes, and the participant limit is checked when the join token is minted, as for every join.
- Blocking, ban lists, an in-meeting switch, sending a participant back to the line, chat with waiting participants, a PIN lock (`config.lock`).
- Sounds for a knock and for an admission: pending, tracked as a follow-up.
- Notifying admitters through the realtime channel: they are already connected to LiveKit.
- Restricting the room's recordings: they belong to the room and keep their own permissions.

## Decisions

### Waiting is a ticket, not a token

Every defect of the earlier rounds came from making the waiting credential a room member token: it had to have its permissions stripped, be refused by routes that check none, be renewed on the token path, and be told apart by every refresh mode. A waiter needs none of what a token gives, so they get none of it.

When the room has `config.lobby.enabled` and the computed permissions lack `lobbyBypass` (admins and the owner hold every permission), the token request with `joinMeeting` runs steps 1 to 3, builds the identity (extracted as `createParticipantIdentity`), knocks (see "The line") and answers **`202 { lobbyTicket, participantIdentity }`** instead of `200 { token }`:

- The **ticket** is a random 128-bit value. Nothing in it is signed or decoded: it means something only while Redis holds its wait. The wait's id is `sha256(ticket)`: Redis keys, entries, `lobby_seen` and connection addresses use it, the server hashes the presented ticket before every lookup, and the ticket itself appears only in the client and in request URLs, so a log line or a dump that names a wait leaks no credential.
- It lives as long as the wait, plus 5 minutes after the wait ends so a client that reconnects learns how it ended. It is never renewed and never expires while the wait goes on, so the realtime channel needs no token expiry or renewal for the waiting room.
- It opens exactly three things: the realtime connection of that wait, the token request once admitted, and the leave request. No other route knows it, so no permission has to be stripped and no route has to refuse it.
- The **identity** is created at the knock and answered with the ticket, so the waiter's page knows it before any token exists and fills `lobbyStatusChanged` with it. It is not secret: admitters and webhooks see it. The client keeps it with the ticket.
- Asking does not start the meeting, reserve the name or take a place in the meeting. The waiting screen prepares the camera and microphone locally: a preview needs no token.

The identity, the name, the correlation fields (`externalId`, `metadata`), the principal of the request (its `memberId` or `userId`, or none for an anonymous link) and how the participant came (`type`: `user`, `identified_guest` or `anonymous`, derived by the server from that principal) are fixed at the knock and kept in the wait, so the participant joins with them once admitted. `externalId` and `metadata` are what the client sent and prove nothing: a backend that admits on its own identifies a waiter by `type` and by the `participantIdentity` of a member or user. A ticket presented with a credential that resolves to another principal is refused with `403`, so a leaked ticket cannot be used with someone else's link. An anonymous wait has no principal, so any anonymous link of the room can present its ticket (see Risks).

### Joining once admitted

The admitted participant's client sends the same token request as any join, with the access credential of its link, plus `lobbyTicket`. A request that carries `lobbyTicket` ignores any previous token attached as bearer (the meeting client attaches its current token to every request), so it never enters refresh mode, and refresh mode never meets the waiting gate. `lobbyTicket` without `joinMeeting` true answers `422`. The server looks the ticket up:

| Wait of the ticket | Answer |
| --- | --- |
| Credential resolves to another principal | `403` |
| `waiting` | `202` with the same ticket: nothing changes. |
| `admitted`, and the join checks pass | The join steps with the wait's identity, name and correlation fields: `assertRoomOpen → assertCanJoin → assertCapacity (connected participants, as for every join) → reserveName → ensureMeetingRoom → consume → mint`. `consume` marks the entry used and records `admitted` as the wait's outcome; only then is the token minted. The used entry keeps counting as a taken place (see "Admission"). The answer is an ordinary join token. |
| `admitted`, and the meeting is full | `return`: the wait goes back to `waiting` with its `knockDate`, and the answer is `202` with the same ticket. |
| `admitted` and the meeting is full, but the wait ended by the time `return` runs | `409` with the recorded `status`. |
| `admitted`, and `assertCanJoin` fails (link disabled, member deleted, `meetingJoin` denied) | The usual access error (`400`, `403` or `404`, as for any join), and nothing changes: the client shows its existing screen and disconnects, and the admission expires a minute after it was granted. |
| `admitted` when the checks pass, but ended by the time `consume` runs (a leave, an end or an expiry in between) | `409` with the recorded `status`. The name reserved for it is freed with the meeting, as for any join that does not connect. |
| ended as `admitted` (its admission was used at the mint, or the waiting room was turned off) | An ordinary join with the wait's identity, name and correlation fields, through the gate as it stands now: a token, or `409` with `status` `admitted` when the gate applies again. |
| ended otherwise, unknown, or of another room | `409` "The wait has ended", with `status` when it is known. |

The answer's kind decides what the client shows, so it never guesses: a token joins, a `202` waits, a `409` shows its screen (with `status` `admitted`, or for a ticket it no longer knows, "You lost your place" with "Ask to join again"). A ticket never starts a new wait, and never yields a token the gate would not give now. The token minted is an ordinary join token: refresh, the in-meeting timer, regenerate and kick stay as they are, with no waiting room case, and the waiting room never looks at that token again.

"Ask to join again" asks like the first time: a new wait at the end of the line, with a new identity for an anonymous participant (a member or a user keeps theirs). The pause after a rejection is the rejected screen's: "Ask to join again" stays disabled for 15 s. A server cooldown would not stop an anonymous participant, who gets a new identity by reloading. There is no block list.

Alternatives considered:
- A waiting credential that is a room member token (the earlier rounds): see above.
- Sending the LiveKit token over the realtime channel on admission saves one request, but the token would have to be kept in Redis to resend it after a lost message, and the join checks would run when admitting instead of when joining.
- Binding the join token to one meeting (`meetingId` in its metadata) and enforcing it on `participant_joined` and on every request: it needed a register of who joined, a cleanup per meeting and the per-meeting end claim, and every round found a new way for it to fail open. A join token is now trusted for its lifetime, as everywhere else in Meet.
- Holding a place for each admitted participant (`pendingAdmissions`) until LiveKit's `participant_joined` reported them, with a sweep that compared LiveKit's `joinedAt` with the admission time when that webhook was lost: it compared two clocks, kept admitted entries alive through a LiveKit outage, and made two scenarios contradict each other. No competitor studied reserves places. What is kept instead is not a reservation: the `admitted` entries count as taken places for the admitters' decisions (see "Admission"), living only in the existing entries, with no new key and no new sweep. The one LiveKit webhook it listens to, `participant_joined`, only releases a place sooner; the sweep expiring an admission compares Redis times alone (the admission time and `TIME`), never LiveKit's `joinedAt`, so it cannot disagree with another clock or be kept alive by a LiveKit outage, which is what the `pendingAdmissions` sweep did.
- Minting for any ended wait whose gate no longer applies: a rejected or kicked participant could replay their ticket. Only a wait ended as `admitted` goes through the gate again.

### Only participants who joined act on the meeting

In a room with the waiting room on, a room member token without a participant identity (one minted without joining) keeps, for every server check, only `recordingList`, `recordingPlay`, `recordingDownload`, `recordingDelete` and `roomShareAccessLinks`: `getAuthenticatedRoomMemberPermissions` reads every other permission as denied for it. `roomShareAccessLinks` gates no operation: it decides whether `getRoom` returns the room's anonymous links, the moderator one included, so behind a waiting room it amounts to `lobbyBypass`. The TSDoc of the permission, the wizard and member-form text and the feature page say so; whether sharing should stop revealing the moderator link is a wider question, outside this change. It is an allow-list, so a permission added later (persisted chat's, for instance) is closed to such a token without touching this rule. API keys are not room member tokens and keep their access.

A join token, the only kind with an identity, is minted only past the waiting gate: to a holder of `lobbyBypass` or to an admitted participant. The rule is stateless (it reads the room the validator already loaded and the token's `sub`), so it needs no Redis read and cannot fail open. The routes that need an identity (captions, a participant's own hand) already refuse a token without one. A holder of `lobbyAdmin` who waits holds a ticket and at most a token without identity, so they can neither list the line nor admit themselves.

`permissions` ("Permissions of the caller") states that a room member token's permissions are narrowed as `waiting-room` specifies, so `meetings`, `meeting-moderation` and `live-broadcast` need no restatement.

Turning `lobby.enabled` on stamps `rolesUpdatedAt` in the same conditional write, only when the stored `lobby.enabled` is `false` and the update sets it to `true`, judged inside that write: saving a config whose waiting room is already on (the wizard's edit mode sends the whole config) stamps nothing. Every room member token issued before the switch then stops working, and refresh mode does not renew a session that connected with one (`fix-refresh-of-revoked-session`). The waiting room has no case in any refresh path. This changes the rule of `authentication` that a change of the room `config` leaves room member tokens valid: turning the waiting room on is the one config change that invalidates them. `rolesUpdatedAt` is a public room field, so its OpenAPI description says it also moves when the waiting room is turned on. Join screens holding a pre-join token get `401` and regenerate it through the existing recovery (`room-member-error-handler.service.ts:93-99`).

A join token connects to the room's media until it expires (2 h by default, `MEET_ROOM_MEMBER_TOKEN_EXPIRATION`), is revoked by a kick, or fails the currency check (room roles, access, waiting room turned on, member or user changes), also in the room's next meeting, as every join token does today. The meeting client drops its token when the participant leaves and on reload, so in practice a participant who leaves or reloads asks again and waits. A host application acting on such a meeting for itself (a dashboard, an admission backend) uses the API key; the OpenAPI of the gated operations and the feature page say so.

### State in Redis, changed by atomic scripts

Keys (prefix `ov_meet:`):

- `lobby:<roomId>`: hash, identity → JSON `{ waitId, participantIdentity, participantName, type, externalId?, metadata?, knockDate, status: 'waiting' | 'admitted', used?: true }`: `used` is set when the admission is used at the mint.
- `lobby_wait:<waitId>`: hash `{ roomId, roomName, identity, principal?, participantName, type, externalId?, metadata?, outcome? }`, the ticket's lookup. It has no TTL while the wait lives and expires 5 minutes after it ends, with `outcome` (`admitted` once the join token was issued or the waiting room was turned off, `rejected`, `left`, `expired`, `meeting_ended`, `room_closed`). `roomName` is stored at the knock, so a `lobbyStatusChanged` sent after the room was deleted still carries it, and no webhook reads MongoDB for it.
- `lobby_seen`: one sorted set for the cluster, member `<roomId>:<waitId>`, score the last time the wait's client was seen, from Redis `TIME`; for an `admitted` entry, the time of the admission, which presence never refreshes. The knock writes its own time minus 45 s, so a wait whose screen never connects is unseen for 60 s 15 s after its knock: one expiry rule covers both cases.
- The sweep's last-run time and the time of the last gap it saw, for its gap guard.

Every change is one Lua script over the room's keys and `lobby_seen` that checks the entry and applies the change atomically:

| Script | What it does | Called by |
| --- | --- | --- |
| `knock` | Refuses beyond 100 entries; ends the earlier wait of the same identity as `left`; creates the entry, the ticket record and its `lobby_seen` member | The token request when the gate applies |
| `decide` | Admit: given the room's capacity (`maxParticipants` minus the participants connected, or none), it counts the `admitted` entries as taken places and so computes the free places itself: the named participants, all `waiting`, set to `admitted` if they fit (their `lobby_seen` score becomes the admission time, from `TIME`), or nothing (`404` when one no longer waits, `409` when they do not fit); with `all`, the first `waiting` entries in arrival order, up to the free places. Reject: the named participants removed with outcome `rejected`, or nothing (`404`); with `all`, every `waiting` entry present when the script runs, removed with outcome `rejected` | `lobbyAdmit`, `lobbyReject` |
| `return` | `admitted` (not used) back to `waiting`, same `knockDate`, `lobby_seen` score set to `TIME`; for a wait that is not `admitted` any more, returns its current state | The ticket request finding the meeting full |
| `consume` | `admitted` entry marked `used` and outcome `admitted` recorded, the entry staying; otherwise (waiting, already used, gone) returns the current state | The ticket request, just before minting |
| `joined` | The `admitted` entry of the identity, used or not, removed with its `lobby_seen` member; a `waiting` entry or no entry changes nothing | `participant_joined` of LiveKit, on any replica |
| `presence` | `waiting` entry: its `lobby_seen` score set to `TIME`, returns status and position. `admitted` entry: returns `admitted`, refreshes nothing. Otherwise returns the recorded outcome | Realtime open, every answered ping |
| `end` | Ends the given waits, or all of the room, with an outcome | Leave, sweep expiry, explicit end, room close or delete, config off, the presence path finding the room closed, deleted or with the waiting room off |

Every script that removes an entry also removes its `lobby_seen` member and records the outcome on its `lobby_wait` with `EXPIRE 300` (`joined`, and the expiry or `end` of a used entry, keep the outcome `admitted` already recorded), so no key of an ended wait lacks a TTL. A meeting starting or ending and a change of `lobby.message` push nothing: each waiter learns them from the next answered ping, which rebuilds `meetingActive` and `message` from the room, within about 20 s. Scripts take the time from Redis (`TIME`), never from a replica's clock. Each returns the waiting identities in arrival order (`knockDate`, then identity), so the replica sends each waiter whose position changed their state, the admitters' signal and the webhook from the same atomic result. "The first decision wins, the later one answers `404`" holds across replicas without a distributed lock, and `consume` is atomic against `leave`, expiry and `end`. `lobbyList` runs no script: it reads the room's entries, lists the `waiting` ones and counts the `admitted` ones, used or not. A list holds at most 100 entries. Room close and room deletion run `end(all, room_closed)`, which removes the room's entries, used ones included, and their `lobby_seen` members and leaves each `lobby_wait` to expire with its outcome, so a waiter who reconnects learns that the room closed.

Alternatives considered:
- A `lobby_seen:<roomId>` hash per room, a `lobby_rooms` set for the sweep and a separate rule for a wait never seen 15 s after its knock: two key families, a cleanup for each, and two expiry rules where one sorted set and one rule do.
- A version per room (`lobby_version`, from Redis `TIME`) on every state, with the client dropping a stale one and taking the state received on open as its baseline, plus a sweep resend of admitted states every 10 s: a final state lost between its script and its publish still stranded the waiter, and once the state is sent on every answered ping the version protects nothing.
- A marker (`lobby_end`) recorded before an explicit end deleted the LiveKit room, acted on by the sweep once the meeting that started at `meetingStartedAt` was over: MongoDB has no meeting start to compare with, and a failed deletion left a marker that later ended the waits of a meeting that only emptied.

### The line

- **Knock:** the `knock` script creates the entry, `lobby_wait:<waitId>` and the `lobby_seen` member, and the replica at once sends the `participantKnocked` webhook and the admitters' signal (see "What admitters receive"), without waiting for the waiting screen to connect: a participant appears in the admitters' list as soon as they press "Ask to join". A knock whose screen never connects is removed by the sweep 15 to 20 s later. It refuses a knock when 100 participants wait (`409`, "The waiting room is full" screen). The client tells it from the token request's other `409` answers by its message, as `meeting-lobby.service.ts` already tells closed and full apart; a machine-readable error code is a follow-up outside this change.
- **Same identity:** every request to join is a new wait. A knock for an identity that already has an entry (a member or a user asking again from a reload, another tab or another device) ends the earlier wait as `left` (`origin` `participant`), records it in that wait's `lobby_wait`, sends that wait its final state, and creates the new one at the end of the line with a new `participantKnocked`. Connections are addressed by wait, so the two never see each other's messages.
- **Presence:** the realtime connection is the only sign that a participant waits. The score of a `waiting` wait is written when the connection opens and each time its client answers a ping (every 20 s), by the `presence` script, which also returns the wait's current state or recorded outcome; the replica sends it straight to that connection (`connection.send`, see `add-realtime-channel`), so it does not depend on the Redis subscription. One script, one room read and one frame per waiter every 20 s, on the replica holding the connection. A waiting wait has no time limit while its connection lives; an admitted one has a minute (see "Admission").
- **Reconciliation on presence:** the state sent on open and on each answered ping already reads the room (for `meetingActive` and `message`). When the room is closed or deleted, the replica ends the wait there as `room_closed`; when its waiting room is off, as `admitted` (`origin` `system` both). This covers a replica that died between a MongoDB write and its `end` script (see "Ending waits") for every connected waiter within 20 s; a disconnected one expires anyway. When MongoDB cannot be read, the replica sends the Redis state with the room fields (`meetingActive`, `message`) it last sent on that connection, or without them on open, and reconciles nothing until the read succeeds; the client keeps what it shows for a field that is missing.
- **The sweep** (`LobbySweepTask`, every 5 s, once per cluster, Redis only):
  - one `ZRANGEBYSCORE` over `lobby_seen` finds the entries whose score is 60 s old: a `waiting` one unseen for 60 s (a knock never followed by a connection, 15 to 20 s after it), an `admitted` one admitted 60 s ago. `end` removes them as `expired` (`origin` `system`), so neither a token request alone nor an unused admission holds a place. A used entry is removed the same way, silently: no webhook, no state, since its participant holds a token;
  - a run that follows a gap of more than 15 s since the previous one (a Redis outage holding queued commands, a stalled replica) only records its time, and so do the runs within 25 s after it (one ping cycle plus margin, so every replica has written its presence again, since the queued commands of the replicas flush in any order): none of them expires anyone.
- **The client's side of the minute:** while waiting or admitted, the realtime client reconnects with its usual delays and gives up 60 s after the last message it received, heartbeats included, about five attempts. It then shows "You lost your place" with "Ask to join again". The server counts from the last pong and the client from the last message, both sent in the same 20 s cycle, so they agree to within one cycle.
- **Leaving:** "Leave waiting room" and `meetingLeave` call `POST /internal-api/v1/meetings/:roomId/lobby/leave?lobbyTicket=<ticket>` with no body, a request without a CORS preflight even from a web component on another origin, sent with a native `fetch` with `keepalive`, not through `HttpService` (its XHR backend has no `keepalive`, and its header provider would add `x-room-member-token`, which forces a preflight), the URL from `RuntimeConfigService.resolveUrl`, and then disconnect the realtime client. The `end` script removes the entry of that wait, waiting or admitted and not yet used, records `left`, and the replica sends `lobbyStatusChanged` `left`; for a wait that already ended it changes nothing. It answers `204` either way, also for a ticket whose wait belongs to another room than the path's `roomId`, which has no effect. Removing a web component does not unload the page, so the request goes on.

Closing or reloading the page, a network loss, a phone in the background and a host application removing the embedded element or its iframe are all the same: a minute without the connection loses the place.

### What the waiter receives

The waiting room registers a realtime authenticator for `lobbyTicket`: it resolves `lobby_wait:<sha256(ticket)>` to the room and the wait, and the connection is addressed by the wait id. An unknown ticket is refused as forbidden (`4403`), which the client shows as "You lost your place", and a connection closed with `1008` is shown the same way. One message type goes to that address:

```
lobby.state  { status: MeetLobbyStatus, queuePosition?, waitedSeconds?, meetingActive?, message? }
```

`MeetLobbyStatus` is the one enum of the feature, shared with the `lobbyStatusChanged` webhook and event: `waiting`, `admitted`, `rejected`, `left`, `expired`, `meeting_ended`, `room_closed`. The server sends `left` only to a wait replaced by a new request. `queuePosition` starts at 1.

- **When.** On open of a connection and on every answered ping, the replica holding it sends the current state of that wait straight to it: `waiting` with its position, `admitted`, or the recorded `outcome`. On each change, the replica that made it pushes the new state through the realtime channel, as a best effort: a lost push is made good at the next answered ping, within about 20 s, also while that replica's Redis subscription is down.
- **Order.** Messages from two replicas may arrive in either order. A final state is applied once and ends the conversation. `admitted` makes the client ask for its token with the ticket, and only that answer decides (a token, `202`, or `409` with `status`). A `waiting` state is shown as it comes and corrected at the next ping, so the position and `meetingActive` may lag one cycle. The client keeps at most one token request with the ticket in flight. While one is in flight it ignores `waiting` and `admitted` states and keeps any final state until the answer. A token answer always wins: once the client holds a token, it ignores every later answer and state of that wait. After "Leave waiting room" or `meetingLeave`, a token answer is discarded.
- **What the host learns.** The waiter's host receives `lobbyStatusChanged` with each state shown. When the screen says "You lost your place" without the server having reported `left` (the client gave up, the ticket is no longer known, or a `409` followed an admission), it dispatches `expired`. After an access or connection error it dispatches no lobby event: the error screen and its dismiss (`embeddedCloseRequested`) apply. The first `waiting` reaches the host with the first state received, not at the `202`, so a host whose realtime connection never receives a message gets only the connection error screen. An `admitted` followed by "Meeting full" (the ordinary join of a waiting room turned off, which found the meeting full) is the same case: no lobby event, and `meetingJoined` never comes. `meetingJoined` is what confirms the join after `admitted`, which the TSDoc of `admitted` says.
- **A network that never reaches the channel.** If the client never received a message on this ticket when it gives up, it shows the existing connection error screen instead of "You lost your place", and logs a console error naming the WebSocket URL, so a proxy or network that blocks WebSockets does not read as a waiting room problem.
- **`meetingActive`** and **`message`** are read from the room (its status and `config.lobby.message`) when the state is built, and omitted when the room could not be read. The waiting screen says "The meeting hasn't started yet" while `meetingActive` is `false`.
- **`waitedSeconds`** is the time since `knockDate`, computed by the server; the client counts on from it locally.
- **A final state** (`rejected`, `left`, `meeting_ended`, `room_closed`, `expired`) makes the client show its screen and disconnect for good. The server never closes the connection (see `add-realtime-channel`).

**No polling fallback.** A network that blocks WebSockets to Meet also blocks LiveKit's signalling, so a waiter there could not join once admitted.

### Admission

- **Capacity.** `lobbyAdmit` reads, once, the participants connected to the meeting and passes the room's capacity (`maxParticipants` minus them, or none) to the `decide` script. The script subtracts the `admitted` entries, used or not, and so computes the free places under its own mutual exclusion: two admitters on two replicas cannot both take the last place. `lobbyList` and `lobbyUpdated` report the same count, never below 0.
- **How long an admission counts.** From the moment it is granted until LiveKit's `participant_joined` reports that identity in the room, with a fixed timeout of 1 minute from the admission. The admission time is the entry's `lobby_seen` score, from Redis `TIME`; presence refreshes only `waiting` entries. Using the admission at the mint (`consume`) marks the entry used and does not release the place; a second mint with the same ticket still fails, as before. `LivekitWebhookService.handleParticipantJoined` calls `LobbyService.joined` right after its standard-participant check, and the `joined` script removes the entry atomically, on whichever replica handled the webhook. With no `participant_joined` within the minute (a failed connection, a page that never asked for its token, a script holding its connection open, a lost webhook), the sweep removes the entry as `expired` (`origin` `system`): an unused admission sends `lobbyStatusChanged` `expired` and its waiter's page says "You lost your place" with "Ask to join again"; a used one is removed silently. A participant already connected but not yet reported counts as connected and as admitted for that interval, so the free places are briefly lower, never higher. This is not the `pendingAdmissions` reservation removed in round 9 (see "Joining once admitted", alternatives): the timeout compares Redis times only, never LiveKit's `joinedAt`.
- **Admitting named participants** (`participantIdentities`, one or several) is all or nothing: `409` when they outnumber the free places, `404` when one no longer waits.
- **Admitting everyone waiting** (`all`) admits the first `waiting` entries in arrival order, up to the free places, and leaves the rest waiting in their place; it never answers `409` for capacity. The answer lists the participants it admitted, possibly none (nobody waits, or no place is free).
- **Rejecting everyone waiting** (`lobbyReject` with `all`) rejects, in the one `decide` script, every entry `waiting` when it runs, and answers with them, possibly none. It never fails because the line changed after the admitter looked at it. A participant who asks after it is a new wait, signalled to the admitters as usual.
- **Admitting** sets the entries to `admitted`, pushes `admitted` to each wait and sends the `lobbyStatusChanged` webhook, and each waiter's client asks for its join token with the ticket. The participant limit is checked again at the mint, counting the participants connected, as for every join (see "Joining once admitted"): a holder of `lobbyBypass` who took the place meanwhile sends the admitted participant back to their place with `202`. LiveKit's own `maxParticipants` stays the hard limit for the short window between the mint and the connection.
- **Failures:**

  | What fails | Outcome |
  | --- | --- |
  | The meeting is full when the token is requested (a holder of `lobbyBypass` took the place meanwhile) | `return`, `202`: the client is back on the waiting screen, in its place. |
  | Two admitters admit for the last place at once, on one replica or two | One succeeds and the other gets `409` (named) or admits nobody more (`all`). |
  | LiveKit refuses the connection after the mint (told through `meetingGet` as today) | The existing "Meeting full" screen; the admission is used up, the place counts until a minute after the admission, and the participant asks again. |
  | The token request is rate limited (`429`) | The client retries after the reset its `RateLimit` header gives, for as long as its realtime connection is up. |
  | The token request keeps failing for another reason (server error, LiveKit room creation failing before `consume`) | The client retries the token request for up to 30 s while its wait stays admitted, then shows the meeting's existing connection error screen; the admission expires a minute after it was granted. |
  | The wait ended between the checks and `consume` | `409` with the recorded `status`, and that status's screen. |
  | The LiveKit connection keeps failing after the mint | The meeting's existing connection error screen; the place counts until a minute after the admission, and the participant asks again. |
  | The answer to the token request is lost after `consume` | The retry gets `409` with `status` `admitted` (the gate applies), and the participant asks again, at the end of the line; the place counts until a minute after the admission. |
  | The room was closed meanwhile | The wait ends with `room_closed` and the "Closed room" screen. |
  | Access was withdrawn meanwhile | The token request answers the usual access error (`400`, `403` or `404`) and changes nothing; the client shows its existing screen and disconnects, and the admission expires a minute after it was granted. |
  | The admission is not used (tab closed, page frozen, connection held open by a script) | The entry is removed a minute after the admission as `expired`, its place is released and the waiter's page, if still open, says "You lost your place". |
| `participant_joined` never reaches Meet | The place is released a minute after the admission; nothing else changes. |

Alternatives considered:
- Admitting everyone waiting all or nothing, `409` when they do not all fit (the earlier rule): the owner chose to let the first in line in. A named selection keeps the `409`, so an admitter who picked specific people never admits only part of them.
- Deny all as a named decision over the identities shown, resent once without the ones gone on `404`: during a flood, entries expire within 20 s, so the confirmed set almost never held; the owner chose `all` on `lobbyReject`.

### Ending waits

- **Explicit end.** `meetingEnd` (REST, meeting UI, embedded command) and the duration limit end every wait present with `meeting_ended` (`origin` `moderator` or `system`) in one `end` script, run right after the LiveKit room is deleted (`deleteRoom` returning `true`). A wait started after that goes on for the next meeting. A replica that dies between the deletion and the script leaves those waits waiting for the next meeting, as an emptied meeting does. When the deletion fails, nothing is ended.
- **A meeting that empties** (the last participant left or lost the connection, and the 20 s departure timeout passed): nothing happens to the waits. An admitted participant still on their way joins the room's next meeting, which their join starts.
- **Room closed or deleted.** `end(all, room_closed)` runs when the room becomes closed or is deleted, not when the request arrives: in the idle path of `updateMeetRoomStatus` and of room deletion, and in `handleRoomFinished` when it applies a scheduled `meetingEndAction` of `close` or `delete`.
- **Config turned off.** `updateMeetRoomConfig` writes the config only if the room has no active meeting (a conditional write, like `updateIdleRoomStatus`), then runs `end(all, admitted)`, which removes every entry, records `admitted` as each wait's outcome, and tells each waiter `admitted`. Their clients ask for their token with the ticket: the wait ended as `admitted`, so the request is an ordinary join: a token, or "Meeting full". When more participants wait than the meeting can take, every one of them gets a token (the mint counts the participants connected) and LiveKit's own limit lets in whoever connects first, whatever their place in line, and refuses the others, who see "Meeting full": keeping the line order would mean holding places, which this design does not do. The feature page says so. A join in flight while the waiting room is turned on lets that one participant in, an accepted race.
- **Config turned on.** The same conditional write sets `rolesUpdatedAt` when it moves `lobby.enabled` from `false` to `true` (see "Only participants who joined act on the meeting").
- **A replica dies before its `end` script.** The presence path ends the waits of a closed, deleted or switched-off room at their next answered ping (see "The line").

### What admitters receive

`MeetSignalType.MEET_LOBBY_UPDATED` (`meet_lobby_updated`), named and shaped like the other signals, sent after every change to the whole meeting room, with `onlyIfRoomExists`:

```
{ roomId, timestamp }
```

The signal only says that the list changed, so it goes to everyone, and a client without `lobbyAdmin` ignores it. A speaker learns only that the line changed, never who is in it.

`lobbyList` answers `{ participants, availablePlaces }`: the waiting participants as `MeetLobbyParticipant` in arrival order, and the free places of the meeting (`maxParticipants` minus the participants connected and the `admitted` entries until `participant_joined` or a minute after the admission, never below 0, or `null` without a limit). An admitted participant is not in `participants`.

The knock sends it at once, so a participant is listed as soon as they ask, before their waiting screen connects; a knock whose screen never connects shows for 15 to 20 s, then its expiry removes it.

A client holding `lobbyAdmin` fetches `lobbyList` when it receives the signal (several signals within 300 ms make one request), when it joins, after a LiveKit reconnection, when its own permissions gain `lobbyAdmin`, every 30 s while it holds `lobbyAdmin` in the meeting, so a knock whose signal was lost shows within 30 s, and, while the list is not empty, when a participant joins or leaves the meeting (events the client already receives), grouped in the same 300 ms window, so the free places follow the meeting. The list travels once per change per admitter, by REST, whatever its size; a data packet carrying it would reach the data channel's 64 KB limit with about thirty waiters. Losing `lobbyAdmin` stops all of it at once: the polling, the handling of the signal, the section, the chip, the notifications and the embedded `participantKnocked` and `lobbyUpdated`.

The client derives from consecutive lists:
- the `lobbyUpdated` embedded event, on the first list after joining and on every list that differs;
- `participantKnocked` (event and notification) for each `(participantIdentity, knockDate)` pair of `participants` not seen in any earlier list since joining, so a return to the line after a full meeting, which keeps its `knockDate`, is not a new knock. The first list after joining only records what it holds: one grouped notification ("3 waiting to join") when not empty, and no `participantKnocked`;
- the chip, the panel and its free places from the list itself.

`MeetSignalType` handlers already ignore packets that did not come from the server. Room metadata (a native LiveKit event) is rejected because every participant would read the names.

### REST, webhooks, embedded API

- **Routes** in `meeting.routes.ts`:
  - `GET /:roomId/lobby` (`lobbyList`);
  - `POST /:roomId/lobby/admit` (`lobbyAdmit`, body `{ participantIdentities }` or `{ all: true }`);
  - `POST /:roomId/lobby/reject` (`lobbyReject`, body `{ participantIdentities }` or `{ all: true }`).

  One operation per decision covers one participant or several, as `broadcastStop` does. `participantIdentities` holds 1 to 100 distinct identities, so a missing or empty list is never read as everyone (`422`, also for a repeated identity). Both operations take exactly one of `participantIdentities` and `all: true` (`422` for both or neither, and for `all` with any value but `true`): `all` is the explicit form of "everyone waiting", an extra field of the same operation rather than a `lobbyAdmitAll` or `lobbyRejectAll` operation and command, so the contract grows by one optional field per operation. A decision on named participants applies to all of them or to none: `404`, whose message names the first identity that no longer waits, as other `404`s name their resource, and `lobbyAdmit` answers `409` when they do not all fit. Both answer `{ participants }`, the participants admitted or rejected. With the waiting room off, `lobbyList` answers an empty list, a named decision `404` and `all` an empty `participants`. The OpenAPI states each of these. All three use `withAuth(apiKeyValidator, roomMemberTokenValidator)`, `withValidRoomId` and `withRoomPermission('lobbyAdmin')`, which the rule of "Only participants who joined act on the meeting" also gates. Unlike the other meeting operations they answer with no meeting running, which the OpenAPI states.

  Internal: the token request (`generateRoomMemberToken`) answers `202 { lobbyTicket, participantIdentity }` when the participant waits and accepts `lobbyTicket` in its body, only with `joinMeeting` true (`422` otherwise); a ticket whose wait belongs to another room is unknown (`409`). The leave request is `POST /internal-api/v1/meetings/:roomId/lobby/leave`, on `internalMeetingRouter`.
- **Webhooks:**
  - `participantKnocked`: once per wait, when it starts, with `roomId`, `roomName` and the participant as `MeetLobbyParticipant`.
  - `lobbyStatusChanged`: each later change of a wait, with `roomId`, `roomName`, the participant, `status` (`admitted`, `rejected`, `left`, `expired`, `meeting_ended`, `room_closed`, or `waiting` when an admitted participant returns to the line), `waitedSeconds` and `origin` (`MeetEventOrigin`, as `participantHandChanged`): `participant` for `left`; `moderator` for a change made by someone else's request (a decision, an explicit end, closing or deleting the room, turning the waiting room off), whatever the credential; `system` for the server's own rules (expiry, a return to the line, the duration limit). Using up an admission at the mint sends none: `participantJoined` follows.
  - One `lobbyStatusChanged` goes out per participant, also for a decision with `all`, as for named decisions.
  - Delivery is the dispatcher's: not stored, so lost if the replica sending it stops, possibly repeated by the retries of `webhooks`, and not ordered between two webhooks. The OpenAPI says so and points integrators at `knockDate` and `waitedSeconds`.
- **Embedded commands** `lobbyAdmit` and `lobbyReject` (`{ participantIdentities }` or `{ all: true }`) call the REST operation of the same name, with its rules. They are gated by `lobbyAdmin` on the client (`@permission`) and on the server.
- **Embedded events:** `participantKnocked` and `lobbyUpdated` (`{ roomId, participants, availablePlaces }`) to the hosts of `lobbyAdmin` holders, and `lobbyStatusChanged` to the waiter's host with `roomId`, `participantIdentity` (from the `202` answer), `status` and, while waiting, `queuePosition`. Unlike the webhook, the event also repeats `waiting` when the position changes. There is no `lobbyKnocked` and no alias; `meet-ce/typings/CLAUDE.md` drops its note about a future one.
- **Commands while waiting:** the command gate gains the `waiting` phase. `mediaToggleAudio` and `mediaToggleVideo` act on the preview as on the device setup screen, and `meetingLeave` leaves the waiting room. The other commands are rejected as before joining.
- **Typings:**
  - `MeetRoomConfig.lobby` (`MeetLobbyConfig`);
  - `lobbyBypass` and `lobbyAdmin`;
  - `MeetLobbyParticipant { participantIdentity; participantName; type: MeetLobbyParticipantType; externalId?; metadata?; knockDate: number }`, its own shape, used by every payload of the feature; the TSDoc of `externalId` and `metadata` says they are as sent by the participant's client and never a proof of identity, and that `type` and the identity of a member or user are derived by the server;
  - `MeetLobbyParticipantType` (`user`, `identified_guest`, `anonymous`, named after `MeetRoomMemberType` and its values): how the participant asked, with their own account, with their personal member link, or with a shared link of the room;
  - the list shape `{ participants: MeetLobbyParticipant[]; availablePlaces: number | null }`;
  - the `lobbyAdmit` and `lobbyReject` payload `{ participantIdentities: string[] } | { all: true }`;
  - `MeetLobbyStatus`, whose TSDoc of `admitted` says that `meetingJoined` confirms the join, and that a join that finds the meeting full after `admitted` raises no lobby event;
  - the signal and its payload, the two webhook types and payloads, and the commands and events with payloads.

  The token metadata does not change.

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

### Backend modules

The feature lives in `services/lobby/`, one responsibility per piece, each an injectable class that PRO can rebind:

- **`LobbyAdmissionPolicy`**: pure functions, no I/O. The waiting gate, the permissions kept for a token without identity in a room with the waiting room on, and the answer to a ticket's state. `RoomMemberService` and `RoomAccessService` call it, so each rule exists once and is unit-tested without Redis or LiveKit.
- **`LobbyStateService`**: the Redis keys and the seven Lua scripts, one script file each, run through `redisService`, like `ParticipantNameService`. It knows nothing of webhooks or messages.
- **`LobbyService`**: the use cases (knock, admit, reject, leave, join with a ticket, end, config off), each one script followed by its notifications. It depends only on `RoomRepository`, `LiveKitService`, `LobbyStateService`, `RealtimeService`, `FrontendEventService` and `WebhookDispatcherService`, because `RoomService` (close, delete, config off), the meeting end (`meeting.controller.ts`), `MeetingDurationLimitService` and `LivekitWebhookService` (`handleRoomFinished`) call it: depending on them would make the cycles `meet-ce/backend/CLAUDE.md` forbids, and no `container.get` breaks one.
- **`LobbyRealtimeHandler`**: the ticket authenticator and the hooks of the realtime channel (open, pong).
- **`LobbySweepTask`**: the 5 s sweep, on the scheduler as it is.
- **Logs:** knocks, decisions, returns and expiries at `verbose`, with `roomId` and the participant identity, never the ticket; a `warn` when the presence path reconciles a room or the sweep skips a run for its gap guard, since each points at a dead replica or a Redis stall. No metrics in v1.
- **`controllers/lobby.controller.ts`** and the request validators: thin, for the three public routes and the internal leave.

`RoomMemberService` keeps the join path as named private steps of `generateTokenForJoiningMeeting`, each a short method, and delegates every waiting room decision to `LobbyAdmissionPolicy` and `LobbyService`. The waiting room reads LiveKit's participants only for the connected count and listens to `participant_joined` only to release a place (`LivekitWebhookService` calls `LobbyService.joined`).

### Frontend

- **Prepared by `refactor-meeting-entry-flow`**, implemented and archived before this change, so the feature's diff carries no rename and no restructuring: the Join screen is `MeetingJoinComponent` and `MeetingJoinService`, the lone participant's panel `MeetingAlonePanelComponent`, the keys `JOIN.*`; `MeetingEntryFlowService` decides which entry screen comes next; `JoinTokenService` requests the join token and maps its failures with the access check's mapping; `MeetingPhaseService.isPreviewing` tells the embedded command gate whether the preview is on. "Lobby" and "waiting" in code then mean only the waiting room.
- **Modules.** The waiting room lives in `domains/meeting/waiting-room/`, one piece per standalone library component, exported through the barrels and composed by the meeting through the customization seam, so PRO can replace any one of them:
  - `WaitingRoomService` (ticket, realtime connection, state);
  - `LobbyAdminService` (list, derived events, commands);
  - waiting screen;
  - outcome screens (rejected, left, lost place, ended, waiting room full);
  - panel section with the free places, the bulk strip and the confirmation dialog;
  - status rail chip at the right end;
  - notification below the rail. `NotificationOptions` of `ov-notifications` gains a second action.
- **Asking from the Join screen.** Whether the participant would wait is known after the access check: the room has `lobby.enabled` and the permissions of their token lack `lobbyBypass`. Then the Join screen's button reads "Ask to join" (`MeetingJoinService` computes it), and the entry flow requests the token at once through `JoinTokenService` instead of opening `prejoin`; the same happens when the Join screen is skipped. The answer of `JoinTokenService` gains the `waiting` kind with `lobbyTicket` and `participantIdentity`, and the ticket request reuses the service and its failure mapping. The client follows the answer, not its guess: a `202` to any join request (Ask, or Join from the device setup screen) opens the waiting phase with its ticket and the devices already chosen, and a token answered to Ask joins at once, as after an admission. Only these requests and the ticket request accept a `202`: the refresh fallback, the permissions-updated regenerate and the 401 recovery treat it as an error, and the waiting phase never marks the meeting active.
- **New phase.** `waiting` follows the Join screen directly for whoever would wait, and leads to `connecting`:
  - the waiting screen creates the local tracks as `prejoin` does (initial media state, room defaults, device errors and menus), and an admission before the device prompt is answered joins with that device off;
  - `RealtimeConnectionService` opens as soon as the `202` arrives, before the local tracks are created (a participant slow to answer the browser's device prompt would otherwise lose the place before the screen connects), with the ticket and `giveUpAfterMs` 60 s, counted from the last message received; the screen says it is reconnecting while the connection is down, and "You lost your place" with "Ask to join again" when the client gives up or the ticket is refused (`4403` or `1008`);
  - `lobby.state` follows the order rules of "What the waiter receives": a final state is sticky, `admitted` asks for the token, `waiting` is shown as it comes;
  - on `admitted`, it asks for its token with the ticket, one request at a time (see "Order"), and acts on the answer: a token ends the wait, so it disconnects the realtime client and runs `_applyToken` → `_connectToRoom` as today; a `202` stays waiting; a `409` shows its screen. A `429` is retried after its `RateLimit` reset while the realtime connection is up; another server failure is retried for up to 30 s, then the connection error screen is shown. After the mint, a full meeting found by LiveKit shows the existing "Meeting full" screen and any other connection failure the existing connection error screen;
  - on a final state, the waiting service shows its screen and disconnects the realtime client for good.

  `MeetingPhaseService.isPreviewing` includes `waiting`, so the device commands work on the waiting screen; the view's own checks of `prejoin` are reviewed for the new phase. `RoomMemberContextService` never holds the ticket as a token.
- **Panel rows.** A name that two waiting participants share (two anonymous "Ana", whose names become unique only at the mint) shows the time each asked to join next to it ("Ana · 10:42"). A row of an `anonymous` participant carries a short "Shared link" label, so a name typed by anyone is told apart from an account or a personal link.
- **Panel bulk strip.** From two waiting:
  - "Deny all", after a confirmation, sends `lobbyReject` with `all: true`: it rejects everyone waiting when the request arrives and never fails because the line changed;
  - "Admit N" admits the first N in line that fit in the free places (N is the number waiting when the meeting has room for all) and sends their identities, so an admitter never admits someone they were not shown. It is disabled when no place is free. On `404` or `409` it fetches the list again and lets the admitter decide on the new one, as a row's buttons do.
- **Teardown.** Leaving while waiting ("Leave waiting room", `meetingLeave`) sends the leave request with `keepalive` and then disconnects. Removing the element only disconnects: the place is lost a minute later, as for an iframe whose page unloads.
- **Background tab.** An admission that arrives while `document.visibilityState` is `hidden` joins with the microphone off, for that join only. A desktop browser keeps a background tab's connection alive; a phone that suspends the page for more than a minute loses the place. The waiting information lives only in the waiting screen.
- **Waiting screen layout.** It replaces the device setup screen for whoever waits. State and position first (the position is the title), then a quiet line with the time waited ("Waiting 4 min", from the first minute on, inside an `aria-live="off"` region), then the room message, then a shorter preview (16:9) with the device controls. "Leave waiting room" is a text button, never a full-width one.
- **Screen readers.** Position changes go to a polite live region, at most one announcement every 10 s. The admission and the final states go to an assertive region, and focus moves to the heading of the outcome screen. The admitters' notification never takes focus and its actions are reachable by keyboard; the rail chip has an accessible name ("3 waiting to join").
- **Copy** (canvas, USER-approved, updated 2026-11-09): Ask to join, Waiting to be let in, You're 2nd in line, The meeting hasn't started yet, Leave waiting room, You weren't let in, You lost your place, Ask to join again, The waiting room is full, Waiting to join, Admit / Deny, Deny all, "Admit 3" (with the count), "2 places left", "Shared link" (USER, 2026-11-10). The wizard says Waiting room, "Join without waiting" and "Admit participants".
- **Plurals and ordinals.** The copy needs them in every locale ("You're 2nd in line", "2 places left", "3 waiting to join", "Admit 3", "Waiting 4 min"), and the translation engine only fills `{name}` placeholders (`translate.service.ts:74-79`). `TranslateService.translate` gains ICU-style variants inside a translation string, `{count, plural, one {# place left} other {# places left}}` and `{position, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}`, the category chosen by `Intl.PluralRules` (with `type: 'ordinal'` for `selectordinal`) for the active language, `=N` matching a number exactly, `other` required, `#` the number formatted for that language, and no nesting. The rules are cached per language and type, and the app's language codes map to their CLDR locales where they differ (`cn` to `zh`, `pt` to `pt-PT`). A string without a variant is filled as today, so no existing key changes.

Alternatives considered:
- The position and "You're in" in `document.title` while waiting: dropped by the owner. The web component runs in the host page's document, so it would rewrite the host application's title, and in an iframe it shows nothing.
- Neutral copy without plurals or ordinals ("Position in line: 2", "Places left: 2"): reads worse, and the engine needs the rules anyway for other counts.
- One key per category (`KEY.one`, `KEY.other`): spreads one sentence over several keys, where an ICU-style string keeps it whole for translators.

### Several replicas

| What | Where it happens | What keeps it correct |
| --- | --- | --- |
| Knock | The replica serving the token request | One script creates the entry and the ticket; the same replica sends the webhook |
| A waiter's connection | Any replica | The ticket resolves from Redis; the replica holding the connection sends the state on open and on every answered ping, and writes presence |
| Admit or reject | Any replica | One script per decision; the realtime channel carries the result to the replica holding the waiter, and the next answered ping makes good a lost push |
| Join with a ticket, leave | The replica serving the request | One script per change; `consume` is atomic against leave, expiry and end |
| Capacity | The replica minting | Counted at the mint as for every join; LiveKit's limit backs it; the `decide` script counts admitted entries as taken places, so two admitters on two replicas cannot both take the last place |
| Release of an admitted place | The replica handling LiveKit's `participant_joined` | The `joined` script removes the entry atomically; the sweep releases it a minute after the admission if the webhook never arrives |
| Acting on the meeting | Any replica | A stateless rule on the token |
| Admitter signals | The replica that made the change | Sent to LiveKit, which every replica can call; admitters also refetch every 30 s |
| Expiry | The sweep | One replica per tick, Redis time, one sorted set; waiting entries unseen for 60 s and admitted ones 60 s after the admission |
| Reconciliation of closed, deleted or switched-off rooms | The replica holding each waiter's connection | The room read that builds the state on open and on every answered ping |
| Explicit end | The replica deleting the LiveKit room | One script right after the deletion |
| A replica dies | Clients reconnect elsewhere | Entries survive in Redis; a client back within the minute keeps its place |

## Risks / Trade-offs

- **[A join token is not bound to one meeting]** → A join token connects until it expires (2 h by default), also into the room's next meeting, as any join token today: an admitted participant or a `lobbyBypass` holder who kept it can use it. Losing `lobbyBypass` through a member or user change does not take it back, because refresh mode renews sessions outdated at member or user level. The meeting client drops it on leaving and on reload, so only a client that kept it on purpose can use it. A kick revokes it, and refresh mode no longer re-stamps a revoked session (`fix-refresh-of-revoked-session`).
- **[Tokens kept from before the waiting room]** → Invalid once it is turned on; a kept token of someone let in afterwards works until it expires (see the previous risk).
- **[A stale reconnection is removed only on `participant_joined`]** → Meet removes a kicked or outdated reconnection when it processes LiveKit's `participant_joined`; a lost webhook, or an error in that check, keeps the session. Its Meet API calls fail regardless, and refresh mode does not renew it.
- **[An unused admission blocks a place for a minute]** → A page that never asks for its token, or a script that holds its connection open, keeps a place taken for one minute after the admission, then loses it; the admitter can admit someone else only after that.
- **[A place lasts one minute without a connection]** → A phone that suspends the page, a sleeping laptop or a reload loses the place, and the participant asks again at the end of the line.
- **[Tickets in URLs reaching proxy access logs]** → A ticket only lets its holder see their own wait, join once admitted with their own link credential, or leave; it dies with the wait. Same exposure class as the token query parameter.
- **[A leaked ticket]** → Its holder can end that wait. For an anonymous wait, which has no principal, any anonymous link of the room can present it and take the admission; for a member or user wait, another credential gets `403`.
- **[Admitted participants hold no place at the media server]** → Admitted entries count as taken places for the admitters until `participant_joined` or a minute after the admission, so admissions do not over-fill the meeting. Nothing holds a place at the mint: a holder of `lobbyBypass` who joins first sends an admitted participant back to their place, and LiveKit's own `maxParticipants` is the hard limit, after which the participant sees "Meeting full" and asks again. A participant counted as connected and as admitted between joining and the webhook only lowers the free places for a moment.
- **[The answer to the token request lost after `consume`]** → The admission is used up: the participant asks again, at the end of the line, and the place is released a minute after the admission.
- **[A replica dies between a script and its notifications]** → The waiter gets their state at their next answered ping, within 20 s, and admitters at their next fetch, within 30 s; a lost webhook is not resent (webhooks are not stored, documented).
- **[A replica dies between an explicit end's LiveKit deletion and its script]** → Those waits go on for the room's next meeting, as when a meeting empties.
- **[Position and "meeting started" lag]** → A `waiting` state can lag a change by one 20 s cycle.
- **[A replica cut off from Redis]** → It keeps its connections and heartbeats, but cannot write their presence; after a minute the sweep of a healthy replica expires those waiters, whose screens still say "waiting" until Redis is back and the next answered ping sends their final state.
- **[Flood of knocks from a public link]** → At most 100 entries, each dropped 15 to 20 s after its knock unless its connection opens and stays, 200 token requests per minute per address; Deny all (`all: true`) clears the list at once. Blocking is a non-goal.
- **[A leaked link keeps the waiting room full]** → Someone holding the room's link opens 100 waits and keeps each alive by answering pings, which the 200 token requests per minute per address allow, so real participants see "The waiting room is full" and Deny all clears the line only until the script knocks again. During a meeting the host cannot turn the waiting room off, disable the link or block. The remedy is to end the meeting and change the link, which the feature page says. Accepted for v1; a host action that stops new requests during a meeting is the first follow-up.
- **[An anonymous waiter who reloads shows twice]** → The old wait stays listed for up to a minute next to the new one with the same name, the rows showing their arrival times; admitting the old row ends it as `expired` while the person keeps waiting. Accepted, and said on the feature page.
- **[Access withdrawn while waiting]** → A member or user deleted, or a link disabled, while their guest waits stays listed and can be admitted; the token request then answers the access error. Accepted.
- **[Ghost knocks show briefly]** → A participant is listed, notified and reported by `participantKnocked` at the knock, before their screen connects (owner's decision), so a knock whose screen never connects (a script, a closed tab) shows in the admitters' panel and notification for 15 to 20 s and produces two webhooks (`participantKnocked`, then `lobbyStatusChanged` `expired`). Accepted.
- **[Identified guests added before 3.10.0 have an access secret that is their participant identity (pre-existing)]** → Anyone who saw such a guest's identity can ask to join as that guest, with that guest's permissions, `lobbyBypass` included; the ticket's binding to the principal does not help for them. Independent of this change; `separate-guest-access-secret` fixed it for guests added since, and the old links are deprecated; this change does not depend on it. Line references into `room-member.service.ts` shift when it merges first.
- **[`roomShareAccessLinks` reveals the moderator link]** → A waiter whose role grants it can read the moderator link through `getRoom` and enter as a moderator without being let in, when `lobbyBypass` is off. Documented, not changed here (see "Only participants who joined act on the meeting").
- **[Room member tokens of a host application]** → A token minted without joining keeps only its recording permissions and `roomShareAccessLinks` in a room with the waiting room on; a host application acting for itself uses the API key.
- **[Two names: API `lobby`, UI "waiting room"]** → Kept on purpose, like `meeting` and "call" elsewhere.
- **[Load: every list change sends per-waiter messages, one signal and one `lobbyList` per admitter, plus one `lobbyList` per admitter every 30 s and one script and one room read per waiter every 20 s]** → Bounded by the 100-entry list and the 300 ms grouping. A participant who waits spends three token requests per join instead of two (the access check, the knock, the request with the ticket), against the 200 per minute of each address: a classroom behind one NAT reaches that limit sooner, and a `429` on the request with the ticket is retried after its reset.
- **[Encrypted rooms]** → Names are the client-encrypted strings, as in `participantJoined`; the panel decrypts them with the viewer's key.

## Migration Plan

Rooms and members migrate forward at startup (v10, v7). Rolling back to a version without the waiting room is unsupported, like any schema bump ("Replicas run one version"); waiters connected during the upgrade reconnect, and keep their place if they are back within the minute. A 3.9 meeting page still open in a tab when the waiting room is turned on gets `202 { lobbyTicket }` to its join and shows a generic error: accepted, since the internal API has no compatibility promise. Requires `revoke-tokens-on-kick` (merged), `fix-refresh-of-revoked-session` and `add-realtime-channel` in the same release; `fix-refresh-of-revoked-session` and `add-realtime-channel` are archived before this change.
