## Why

Anyone holding a room's link enters the meeting at once. Hosts of classes, consultations and public meetings need to see who is asking and decide who comes in, as Jitsi (lobby), BigBlueButton (guest policy), plugNmeet and Whereby (knocking) allow. It is the strongest access-control request after per-link permissions. This is Phase 6 of the parity plan (`../openvidu-competitors/meet-update-plan/phase-specs/phase-06-lobby.md`), with its screens designed on the feature's design canvas. It replaces the earlier "lock room" plan: whoever waits connects to Meet through the realtime channel of `add-realtime-channel`, never to the media server.

## What Changes

- **Room config:** `config.lobby` (`enabled`, `message`), off by default, turned on or off only between meetings like the rest of the config. The meeting has no switch to turn it off.
- **Who waits:** in a room with the waiting room on, a participant without `lobbyBypass` asks to join from the Join screen, whose button reads "Ask to join", and waits instead of joining. They skip the device setup screen: the waiting screen is where they prepare their camera and microphone, so the host learns about them a minute earlier and they go through one screen less. The holders of `lobbyAdmin` see them, and the `participantKnocked` webhook is sent, as soon as they ask, before their waiting screen connects.
  - The server answers with a waiting ticket and the participant's identity, not a token: an opaque value that only keeps the wait's realtime connection, fetches the join token once admitted and leaves the line. It lasts as long as the wait, with no renewal, and gives no access to the media server or to the meeting's API. Asking does not start the meeting, reserve the name or take a place in the meeting.
  - A place in line belongs to a live connection: the participant keeps it while their meeting client stays connected to Meet, and loses it after about a minute without the connection, whatever the cause (network, closed or reloaded page, a phone suspending the page, a host application removing the embedded element or iframe). Their meeting then says they lost their place and offers to ask again. "Leave waiting room" and `meetingLeave` end the wait at once, through a request of their own that arrives even while the connection is down.
  - Every request to join is a new wait at the end of the line; a second request of the same identity ends the first. A wait that ended during a short disconnection is reported when the connection comes back, never replaced by a new one.
  - Holders of `lobbyBypass` join directly. A participant admitted who reloads the page asks again and waits. Gaining `lobbyBypass` while waiting does not end the wait.
- **Admitting and rejecting:**
  - Admitting lets the participant join without reloading, with the identity they waited with. The admission is used when their join token is issued. A holder of `lobbyAdmin` can only admit as many participants as there are free places, which count the participants admitted until LiveKit reports them in the meeting, a minute after the admission at most, so an admission not used within a minute is lost; the waiting list returns the free places, and two admitters at once cannot both take the last place. Admitting everyone waiting lets the first in line in, up to the free places, and the rest keep waiting in their place.
  - An admitted participant who finds the meeting full when asking to join goes back to their place.
  - Rejecting tells them they were not let in, and their screen lets them ask again after a short pause.
  - Rejecting everyone waiting rejects, in one atomic step, whoever waits when the request arrives; it never fails because the line changed, and whoever asks after it waits as usual.
  - Both work one by one, for a set of participants or for everyone waiting, from the meeting UI, the embedded API and REST.
  - There is no blocking and no way to send a participant back to the line.
- **The meeting is closed to whoever was not let in:** in a room with the waiting room on, a join token is issued only to a holder of `lobbyBypass` or to an admitted participant, and a room member token without a participant identity (one obtained without joining) keeps only its recording permissions and `roomShareAccessLinks`, so it no longer acts on the meeting (reading it, its participants and its broadcasts, ending it, moderating, recording, broadcasting, admitting); API keys keep their access; turning the waiting room on invalidates the room member tokens issued before.
- **The waiting screen** holds the camera preview and the device controls, and shows the position in line, the room's message, and whether the meeting has started. Counts and ordinals follow each language's plural and ordinal rules.
- **What `lobbyAdmin` holders see in the meeting:** a "Waiting to join" section at the top of the participants panel with the free places and a "Shared link" label on the rows of participants who came with a shared link, a status rail chip, and a notification with Deny and Admit while the panel is closed.
- **New public contracts:**
  - REST `lobbyList` (`participants` waiting and `availablePlaces`), `lobbyAdmit` and `lobbyReject` under `/api/v1/meetings/{roomId}/lobby`, the two decisions for one participant, several, or everyone waiting (a body without `participantIdentities`, as `broadcastStop`), with the schema `MeetLobbyParticipant`, which says how each waiter came (`type`: `user`, `identified_guest` or `anonymous`).
  - Webhooks `participantKnocked` and `lobbyStatusChanged` (with `origin`, as `participantHandChanged`).
  - Embedded commands `lobbyAdmit` and `lobbyReject`, each for one participant, several, or everyone waiting, like their REST operations.
  - Embedded events `participantKnocked`, `lobbyUpdated` and `lobbyStatusChanged`.
  - One status enum, `MeetLobbyStatus`, shared by the `lobbyStatusChanged` webhook and event.
  - Permissions `lobbyBypass` (join without waiting) and `lobbyAdmin` (list, admit and reject).
- **Console:** the Room Access step of the room wizard gains a Waiting room section (switch and message) and the "Join without waiting" and "Admit participants" permissions.
- **Refactor, in its own change before this one (`refactor-meeting-entry-flow`):** the frontend Join screen pieces named "lobby" are renamed and the lone participant's `MeetingWaitingPanelComponent` is removed, so "lobby" and "waiting" mean only the waiting room, and the entry flow gets one owner, with the join token request (`JoinTokenService`) apart from the Join screen. Each waiting room piece is its own library component.

## Capabilities

### New Capabilities

- `waiting-room`: holding participants until someone admits them, on every surface. It covers:
  - who waits and who bypasses;
  - the waiting list, its order, its limit, and how long a place lasts;
  - admission, the free places, its failure, rejection, and what ends a wait;
  - who may read a meeting held behind a waiting room;
  - what the waiter and the admitters see;
  - the REST operations, the webhooks, the embedded commands and events, and the wizard section.

### Modified Capabilities

- `permissions`:
  - twenty-four permissions instead of twenty-two;
  - the waiting room permissions;
  - their role defaults, their completion on older data, and their lack of a deprecated name;
  - the permissions of a room member token are narrowed in a room with the waiting room on, which every operation gated by a permission follows (`meetings`, `meeting-moderation`, `live-broadcast` and the others need no change of their own).
- `room-config`: the default config and the switch rule cover `lobby`, and `null` removes `lobby.message`.
- `room-members`: the member form's permission toggles gain a Waiting room group.
- `meeting-join`: the server's join checks hold a participant back while the waiting room applies to them, a participant who would wait asks from the join screen and skips the device setup screen, and `meetingLeave` leaves the waiting room.
- `embedded-api`: the command and event catalogues list the waiting room commands and events, and the media and leave commands run while waiting.
- `webhooks`: the event catalogue lists `participantKnocked` and `lobbyStatusChanged`.
- `authentication`: turning the waiting room on invalidates earlier room member tokens.
- `meeting-moderation`: a kicked participant without `lobbyBypass` asks again and waits in a room with the waiting room on.

## Impact

- **REST API, additive:**
  - three operations in the meetings group, the only ones of the group that answer with no meeting running, with the schema `MeetLobbyParticipant`; both decisions take named participants or, without `participantIdentities`, everyone waiting;
  - `config.lobby`;
  - permission keys `lobbyBypass` and `lobbyAdmin`;
  - in rooms with the waiting room on (a room with it on cannot exist before this change), a room member token without a participant identity keeps only `recordingList`, `recordingPlay`, `recordingDownload`, `recordingDelete` and `roomShareAccessLinks`, so the operations gated by `meetingRead`, `meetingEnd`, the participant permissions, `recordingControl`, `broadcastControl`, `broadcastEdit` and `lobbyAdmin` answer it `403`: a room member token acts on the meeting only if it carries a participant identity (a join token). A host application acting on such a meeting for itself (a dashboard, an admission backend) uses the API key. The OpenAPI and the feature page say so;
  - turning the waiting room on invalidates the room member tokens issued before, the one change of the room config that does: the rule that a config change leaves room member tokens valid gains this exception, and the public `rolesUpdatedAt` also moves then;
  - the internal `generateRoomMemberToken` answers `202 { lobbyTicket }` when the participant waits and accepts `lobbyTicket` once admitted, and a new internal operation lets a waiting participant leave. The internal API has no compatibility promise.
- **Webhooks, additive:** event types `participantKnocked` and `lobbyStatusChanged`, accepted by the webhook event filters.
- **Embedded API, additive:**
  - two commands;
  - three events, on the web component and the iframe;
  - `mediaToggleAudio`, `mediaToggleVideo` and `meetingLeave` also run while waiting;
  - the frozen embedded API contract test is updated.
- **Meeting UI:** the "Ask to join" button, the waiting, rejected, left, expired, ended and "waiting room full" screens, and the admitters' panel section, rail chip and notification, translated in every supported language.
- **Console UI:** the Waiting room section and the two permissions in the Room Access step.
- **Deployment:**
  - no new variable;
  - schema migrations bump rooms to v10 and room members to v7;
  - needs `revoke-tokens-on-kick` (merged), `fix-refresh-of-revoked-session` (refresh never renews a revoked session or one older than the room's `rolesUpdatedAt`), and the realtime channel (`add-realtime-channel`) and its WebSocket path, with no polling fallback: a proxy or load balancer of the operator's own in front of Meet must pass WebSocket upgrades on the Meet path and keep idle connections open for more than 20 seconds, and an external Redis whose Meet user is restricted by ACL must grant it `&ov_meet:*` (upgrade note, and the deployment pages updated by `add-realtime-channel`).
- **CE extension seams:** the waiting screen, the outcome screens, the panel section, the rail chip and the notification are separate library components that the meeting composes, so PRO can replace any of them.
- **openvidu.io:**
  - a new feature page, `docs/meet/features/meetings/waiting-room.md`, which also tells host applications to read a meeting behind a waiting room with the API key, that `externalId` and `metadata` prove nothing, and the limits of a public link (a flood keeps the waiting room full until the meeting ends and the link changes; an anonymous waiter who reloads shows twice for up to a minute);
  - `docs/meet/features/meetings/moderation.md` (a kicked participant joins again at once, except behind a waiting room);
  - `docs/meet/features/meetings/configuration.md` (`config.lobby`);
  - `docs/meet/features/rooms/access.md` (`lobbyBypass` and `lobbyAdmin` in the predefined roles);
  - `docs/meet/embedded/reference/webhooks.md` (`participantKnocked`, `lobbyStatusChanged`);
  - `docs/meet/embedded/reference/webcomponent.md` (a host page's Content Security Policy allows the Meet origin in `connect-src` for WebSocket);
  - the regenerated embedded API and REST API references.

## Decisions taken

USER, 2026-11-09 (spec review rounds 9 and 10), 2026-11-10 (rounds 11 and 12). The current state, with the latest answers at the end.

Tokens:
- Waiting is a ticket, not a token: a waiter gets an opaque waiting ticket, bound to the principal that knocked, that serves only its own wait (realtime connection, join token once admitted, leave), lasts as long as the wait with no renewal, and holds no LiveKit token. A request carrying `lobbyTicket` ignores the bearer token and never enters refresh mode.
- Mint once: the admission gates only the join token's mint and is used there; it keeps counting as a place until the participant joins (round 12). Refresh, regenerate and kick stay as on `main`; `fix-refresh-of-revoked-session` adds the generic rule that refresh never renews a session that was revoked, or one older than the room's `rolesUpdatedAt`.
- Turning the waiting room on invalidates every room member token issued before it (it stamps `rolesUpdatedAt`). This changes the rule "a change of the room config leaves room member tokens valid", and the `CHANGELOG.md` entry says so.
- In a room with the waiting room on, a room member token without a participant identity keeps only its recording permissions and `roomShareAccessLinks`; a host application acting for itself uses the API key.
- A join token is not bound to one meeting: an admitted participant who leaves without reloading can come back with it while it lasts (2 h by default), also into the room's next meeting, as any join token today. A kick revokes it.

The line:
- The waiting room is turned on or off only between meetings; the meeting has no switch. Turning it off lets everyone waiting in.
- A place belongs to a live realtime connection, with about 60 s of grace; a wait has no time limit while the connection lives. Removing the embedded element or iframe is such a loss, never a leave.
- Every request to join is a new wait at the end of the line; a second request of the same identity ends the earlier one as `left`. An admitted participant who reloads goes back to the line. Gaining `lobbyBypass` while waiting does not end the wait.
- Leaving ("Leave waiting room", `meetingLeave`) is an internal request with the ticket in the query, sent with `keepalive`.
- The ticket of a wait that ended never starts a new wait: one ended as admitted is an ordinary join with its identity through the gate as it stands, which is how turning the waiting room off lets everyone in; any other ended wait answers `409`.

Decisions on waiters:
- No `pendingAdmissions` reservation compared with LiveKit's `joinedAt`; an admission counts as a taken place as the round 11 and round 12 answers say. `lobbyAdmit` answers `409` when the participants named outnumber the free places. An admitted participant who finds the meeting full when asking for the token goes back to their place.
- Admitting everyone waiting (`lobbyAdmit` without `participantIdentities`) admits the first in line, by arrival order, up to the free places; the rest keep waiting in their place, and the answer lists who was admitted. Admitting one participant, or a named selection that does not fit, keeps the `409`. The panel's "Admit N" sends the identities it shows.
- REST `lobbyList`, `lobbyAdmit` and `lobbyReject` under `/api/v1/meetings/{roomId}/lobby`, answering with no meeting running; a named decision is all or nothing (`404` when one no longer waits); omitting `participantIdentities` decides on everyone waiting, as `broadcastStop` does with `broadcastIds`, and an empty list is `422`. No `all` field, no `lobbyAdmitAll` or `lobbyRejectAll`. The API verb is `reject`; the UI says Deny.
- A rejected participant may ask again, after a 15 s pause that lives only in their screen. There is no block list in v1 and no sending back to the line.

Ending waits:
- An explicit end of the meeting and its duration limit end the waits (`meeting_ended`) inline, right after the LiveKit room is deleted; a crash in that window leaves those waits for the next meeting, an accepted risk. A meeting that only empties, or a host who loses the connection, keeps them waiting. Closing or deleting the room ends them (`room_closed`).

What the waiter and the admitters receive:
- The waiter's state reaches them at once through the realtime push; a lost push is made good on the next answered ping (20 s cycle). Final states are sticky, and the answer to the token request is authoritative. No versioned state, no resend of admitted states, no resync of the channel.
- The waiting screen shows the room's custom message, and says "The meeting hasn't started yet" while no meeting runs.
- `meet_lobby_updated` (`roomId`, `timestamp`) goes to the whole meeting room; holders of `lobbyAdmin` fetch `lobbyList` on it, on joining, after a reconnection, on gaining `lobbyAdmin`, every 30 s, and when a participant joins or leaves the meeting while someone waits.

Contracts:
- `MeetLobbyParticipant` is the feature's only participant schema; `lobbyList` and `lobbyUpdated` return `{ participants, availablePlaces }` (`null` without a limit).
- One flat status enum, `MeetLobbyStatus` (`waiting`, `admitted`, `rejected`, `left`, `expired`, `meeting_ended`, `room_closed`), for the webhook and the event. The webhook carries `origin`, and the time waited follows from the participant's `knockDate` and the event's `creationDate`; `participantKnocked` is the only name of the knock, as event and webhook. A waiter's host learns how the wait ended from `lobbyStatusChanged`, never `meetingLeft`.
- Webhooks are not stored (no outbox): lost if the replica sending them stops, possibly repeated by the retries of `webhooks`, and unordered.
- `lobbyBypass` and `lobbyAdmin` are independent per-role permissions, granted by the migration to the moderator role and to members with that role.
- No polling fallback; the upgrade note and the deployment pages state the proxy and Redis ACL requirements of the WebSocket path.

Review round 10:
- No page title: the waiting room never writes the position or "You're in" into the page title, in any embedding mode. The waiting information lives only in the waiting screen.
- A participant appears in the admitters' list, the admitters are signalled through the LiveKit data channel and `participantKnocked` is sent as soon as they press "Ask to join", without waiting for their waiting screen to connect. The presence rules remove a knock whose screen never connects (the one 60 s rule, a knock counting as seen 45 s before it), so ghost knocks from a flood show for about 15 s: an accepted risk.
- `lobbyReject` decides on everyone waiting without `participantIdentities`, like `lobbyAdmit`: in one atomic step it rejects everyone waiting at that moment, and whoever asks after it is signalled to the admitters as usual. The panel's Deny all sends it, and it never fails because the line changed.
- Counts and ordinals ("You're 2nd in line", "2 places left") use the CLDR plural and ordinal categories through `Intl.PluralRules`, with ICU-style variants per category in the translation files; the approved texts stay.
- Turning the waiting room off while more participants wait than the meeting can take lets in whoever connects first, documented on the feature page.

USER, 2026-11-10 (spec review round 11):
- Places for admitted participants: admission runs under mutual exclusion and counts the participants admitted who have not joined yet as taken places. The free places (those `lobbyAdmit` computes, `availablePlaces` in `lobbyList` and `lobbyUpdated`, and the `409` of named admissions) are `maxParticipants` minus the participants connected minus the `admitted` entries, and that subtraction happens inside the same atomic `decide` script, so two admitters on two replicas cannot both take the last place: one succeeds, the other gets `409` (named) or admits nobody more (everyone waiting). "Admit all" fills the free places in arrival order and leaves the rest waiting. An admitted entry stops counting when it returns to the line, and as round 12 says (superseding the round 11 rule that it stopped at the mint or with the presence rule), when LiveKit reports the participant joined or a minute passes. This is not the `pendingAdmissions` reservation cut in round 9: it lives only in the existing entries, with no new key. The mint's capacity check stays (a `lobbyBypass` holder can still take a place meanwhile, and the admitted participant then goes back to their place with `202`), and LiveKit's `maxParticipants` stays the hard limit for the short window between the mint and the connection.
- `externalId` and `metadata` prove nothing: they are what the participant's client sent. The TSDoc of `MeetLobbyParticipant`, the OpenAPI of `lobbyList` and `participantKnocked`, and the feature page say that an admission backend identifies waiters by the `participantIdentity` of a member or user, and by `type`.
- A leaked link keeps the waiting room full (the knock flood of a link holder) is accepted for v1: the limit and its remedy (end the meeting and change the link) are documented. A host action that stops new requests during a meeting is the first follow-up, outside this change and not a requirement.
- The waiting list shows how each waiter came: `MeetLobbyParticipant.type` (`user`, `identified_guest`, `anonymous`, after `MeetRoomMemberType`), with a short "Shared link" label on the panel rows of `anonymous` waiters, and the value in every webhook, event and REST payload that carries the participant.
- The catalogue requirements of `embedded-api` drop "each as its owner specifies": the "Owner of each command" and "Owner of each event" scenarios state the ownership, and "Event catalogue" has no room left under the size limit.
- The waiter's room state (`meetingActive`, `message`) is pushed only by answered pings, not on `room_started`, `room_finished` or a message change, and the realtime connection opens as soon as the `202` arrives. A knock whose screen never connects leaves the list 15 to 20 s after it (the sweep runs every 5 s).

USER, 2026-11-10 (spec review round 12):
- The knock answers `202 { lobbyTicket, participantIdentity }`, so the waiter's page knows its identity and fills `lobbyStatusChanged` with it.
- An admission counts as a taken place from the moment it is granted until LiveKit's `participant_joined` reports that identity in the room, with a fixed timeout of 1 minute from the admission. The admission records its time from Redis `TIME`; presence refreshes only `waiting` entries. Using the admission at the mint (`consume`) marks it used and does not release the place; `participant_joined` removes it atomically on any replica. With no `participant_joined` in the minute, the place is released. An unused admission ends as `expired` (`origin` `system`) and its waiter sees "You lost your place" with "Ask to join again". A used one, whose participant holds a join token and may still connect with it, is removed silently: no webhook, no state, and LiveKit is not asked whether the participant is there. The sweep compares only Redis times, never LiveKit's `joinedAt`, unlike the removed `pendingAdmissions`. A participant counted as connected and as admitted between joining and the webhook only lowers the free places for a moment.
- `availablePlaces` and the `409` of named admissions therefore count the admitted participants until they join, as reported by `participant_joined`, or the minute passes.
- `roomShareAccessLinks` reveals only the links whose permissions the holder has (`share-links-within-own-permissions`, USER, 2026-11-10), so it never reveals the moderator link to a waiter.

Scope:
- 3.10.0, CE only, any number of replicas. Archived after `refactor-meeting-entry-flow`, `fix-refresh-of-revoked-session` and `add-realtime-channel`. An identified guest's access secret being their participant identity is a pre-existing defect, independent of the waiting room, fixed for guests added since by `separate-guest-access-secret` (USER, 2026-11-09); guests added before 3.10.0 keep it until the deprecation ends.
- Sounds for a knock and for an admission are pending, outside this change.
- Follow-up, outside this change: a host action that stops new requests to join during a meeting.

USER, 2026-11-10 (contract review):
- `lobbyAdmit` and `lobbyReject` take `{ participantIdentities }` for named participants and an empty body for everyone waiting, the convention of `broadcastStop`; there is no `all` field. An empty `participantIdentities` stays `422`.
- `lobbyStatusChanged` has no `waitedSeconds`: the participant's `knockDate` and the event's `creationDate` give the time waited.
