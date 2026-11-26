# Design

## Context

Chat messages travel today as LiveKit text streams with topic `chat`, published by the sender's browser with
`destinationIdentities` set to the remote participants holding `chatRead`; the server never sees them. The backend
talks to LiveKit only through its HTTP API and receives LiveKit webhooks, deduplicated per event by the webhook lock.

Every place that lists, counts or announces participants filters them with `MeetParticipantHelper.isStandardParticipant`
(kind `STANDARD`) or by the Meet metadata the saver does not carry (the waiting-room admitters), except `LiveKitService.participantExists` and `LiveKitService.roomHasParticipants` (the first checks
a given identity; the second is used by `recordingStart`, `broadcastStart` and the stale recording sweep), which count
every LiveKit participant. This change
makes `roomHasParticipants` ignore the chat saver; every other participant counts as today. LiveKit's own
`maxParticipants` check, which Meet sets when it creates the LiveKit room, and its empty-room close both ignore
agent-kind participants. LiveKit creates a room when a participant joins one that does not exist (`auto_create`); Meet
creates its rooms itself when it issues a join token (`RoomService.createLivekitRoom`, which returns the LiveKit room
when one already exists) and treats an auto-created room as an anomaly. The metadata Meet writes into the LiveKit room
carries the room's config (`roomOptions.config`) besides the meeting's start and deadline, which the meeting interface
already reads from it.

`MeetRoomHelper.disableFeaturesExcludedByE2EE` already turns recording, broadcast and captions off for encrypted rooms.
Room schema is at version 10. Every Meet date is stored as a number of milliseconds.

## Trial (throwaway spike, 2026-11-26)

`@livekit/rtc-node` 1.2.3 against the local deployment's LiveKit, on the host and inside `node:24-slim`, with the
saver in a process of its own so it could be killed:

- LiveKit sends `participant_joined` and `participant_left` webhooks for it whatever its kind (`AGENT` or `EGRESS`),
  carrying its kind and `permission.hidden`. Meet's handlers skip every kind but `STANDARD` and `EGRESS` today, so the
  saver needs a branch of its own.
- Killed with `SIGKILL` (a replica crash), LiveKit removes it and sends its `participant_left` about 21 s later.
- Subscribe-only, like an egress (`canSubscribe: true`, `canPublish: false`, joined with `autoSubscribe: false`), it
  receives every participant with name and metadata as they join, subscribes to no track and receives no media, so
  each message's sender is resolved locally. With `canSubscribe: false` it saw no participant.
- Hidden, no client sees it. With kind `AGENT` LiveKit closes the room on the usual departure timeout once the last
  standard participant leaves, and `isStandardParticipant` already drops it from lists and counts. Hidden without a kind
  kept the room until the empty timeout.
- Kind `EGRESS`, with or without the `recorder` grant, marks the LiveKit room `activeRecording: true`, which any LiveKit
  client (`room.isRecording`) and the OpenVidu dashboard read as a recording in progress; kind `AGENT` does not.
- It receives a text stream only when it is in `destinationIdentities` or the stream has none.
- `RoomServiceClient.sendData` to one identity reaches only that participant.
- On Alpine the binding does not load, not even with `gcompat` (`__vsnprintf_chk: symbol not found`).
- A join token that carries a room configuration (`metadata`, `emptyTimeout: 1`) changes nothing in a room that exists:
  a room created through the API kept its metadata, timeouts and `maxParticipants` after the saver joined it. When the
  saver's join created the room, the room got both, and LiveKit closed it by itself 1.4 s later with the saver still
  connected (an agent does not count for the empty timeout), disconnecting the saver with `ROOM_CLOSED`.

## Goals / Non-Goals

**Goals:** store every message of a room that saves its chat once, with the sender LiveKit reports; serve it to the
current meeting's participants; survive a replica or MongoDB outage while the sender stays.

**Non-Goals:** recovering messages whose sender left unconfirmed (future: ask other participants); any public read of the
history; showing earlier meetings, the `history` setting and the "Former member" label
(`chat-history-across-meetings`); webhooks or embedded events (`chat-integration-api`); saving in encrypted rooms.

## Decisions

### The chat saver: one hidden, subscribe-only participant per meeting

A `ChatSaverService` in the backend holds, per meeting it saves, one `@livekit/rtc-node` `Room` connected through
`LIVEKIT_URL_PRIVATE` with `autoSubscribe: false`, identity `MEET_CHAT_SAVER_IDENTITY` (a constant no Meet credential
can produce: every Meet identity stays within `[a-z0-9_-]`, so its value holds a character outside that set, for
example `meet.chatSaver`), the participant attribute `meet.role: chatSaver`, token kind `agent` and grant `{ roomJoin, room,
hidden: true, agent: true, canSubscribe: true, canPublish: false, canPublishData: false }`: the permissions of an
egress, without its kind, so the room is never reported as recording. It keeps the participants the room reports, with
their name and Meet metadata, and registers a text stream handler for topic `chat`.

The LiveKit webhook handlers recognize it by identity, kind `AGENT`, `permission.hidden` and `meet.role` together,
before any other routing: its `participant_joined` is ignored, its `participant_left` triggers the rejoin below, and
neither reaches the Meet participant events or webhooks.

`ensureSaver(roomId)` joins only when all of these hold:

- the LiveKit room exists and its metadata is Meet's, with `chat.enabled` and `chat.persist` true and `e2ee` off in the
  room config that metadata carries (`MeetRoomHelper.extractRoomOptionsFromMetadata`; the webhook's room when it brings
  the metadata, read from LiveKit otherwise). That is the config the meeting started with, the same for the saver, the
  history read and every browser, whatever any of them read before the meeting started;
- LiveKit answers that `MEET_CHAT_SAVER_IDENTITY` is not in it, read through a new `LiveKitService` method that returns
  nothing only on LiveKit's not-found error (`isNotFoundError`) and throws on any other, which skips the join, so an
  outage never causes one. `LiveKitService.getParticipant` cannot be reused, since it reports every error but a refused
  connection as not found;
- this replica is not opening a connection for that room and holds none that LiveKit lists, compared by participant
  sid, since every saver has the same identity. A connection it holds that LiveKit no longer lists (its network dropped
  while the process lived) is disconnected and replaced.

The saver's token carries a LiveKit room configuration with the metadata `{ "createdBy": "meet-chat-saver" }` and
`emptyTimeout: 1`. LiveKit applies it only when the saver's join creates the room (the meeting closed between the check
and the join) and closes that room by itself about a second later, which disconnects the saver (see the trial). The
saver never deletes it: its delete by name could hit the room of a meeting starting in that second. While it lives it is
never a Meet meeting:

- Meet's webhook filter ignores a room whose metadata is not Meet's, so its `room_started` and `room_finished` cause no
  `meetingStarted`, `meetingEnded` or `ensureSaver`. `webhookEventBelongsToOpenViduMeet` answers no for a room carrying
  the saver's metadata, in the event or read from LiveKit, before its fallback on the Meet room existing;
- `RoomService.createLivekitRoom`, finding it when a join token is requested, never returns it as it returns a
  meeting's room: it waits until LiveKit closes it (re-reading the room every 250 ms, up to 5 s) and then creates the
  meeting's room as usual, or returns the meeting's room another request created meanwhile. It deletes nothing while
  waiting, since two requests deleting by name could delete the room the other just created; only a room that still
  carries the saver's metadata after the wait (a participant reconnected straight into it) is deleted before the
  meeting's room is created;
- `reconcileOpenRoomsGC`, which calls `handleRoomStarted` for every LiveKit room of an open Meet room, skips it;
- a saver that finds itself in it stores nothing and leaves.

A saver connection serves the LiveKit room it finds on connecting: it writes that room's sid as `meetingId` and takes
`meetingStartDate` from its metadata, and re-reads neither. When the config in that metadata does not save (the meeting
`ensureSaver` checked ended and another started with other settings), it leaves. `@livekit/rtc-node` reconnects by itself; when its
`roomSidChanged` event carries another sid than the one the saver writes (the reconnection landed in a room of another
meeting), the saver leaves and `ensureSaver` runs for the room again. `getSid()` is not used for this check: it only
returns the last room info the binding received, so it would have to be polled, while `roomSidChanged` reports the
change when it happens.

`ensureSaver` runs:

- on `room_started`, once the room is activated (never for a closed room or a stale event, which `handleRoomStarted`
  already returns early on);
- on `participant_joined` of a standard participant, so a lost webhook or a restart heals on the next join;
- on `participant_left` of the saver itself, while the room still has standard participants: whichever replica gets the
  webhook rejoins it. After a crash LiveKit sends it about 21 s later; the messages sent meanwhile go unconfirmed and
  their senders send them again to the new saver;
- in `validateRoomsStatusGC`, which every replica runs when it starts (skipped while another replica holds the task
  lock) and one replica runs every `ROOM_ACTIVE_VERIFICATION_GC_INTERVAL`, for every active meeting.

The webhook handlers run inside the 5 s webhook lock, so they start `ensureSaver` without awaiting the connection, as
`startAutoRecordingIfNeeded` is started. The config the saver follows is the one in the LiveKit room's metadata, fixed
for the meeting, so nothing reacts to config updates. Two replicas racing both join with the same identity: LiveKit
keeps the last one and disconnects the other (`DUPLICATE_IDENTITY`), which the losing replica takes as a normal end and
does not rejoin; a `participant_left` LiveKit may send for the replaced connection finds the winner listed and joins
nothing. A failed join (for example, no WebRTC reach to the media server) is logged as an error naming the room and
retried on the next trigger, as is a connection that ends in a room that is not Meet's;
the meeting goes on unsaved. The saver leaves when LiveKit closes the room, on the usual departure timeout, or when the
meeting is ended. The `Room` objects are the only per-replica state, and they are live connections that LiveKit's
webhooks recover, not request state. The backend has no shutdown handler, so a stopped replica's savers leave the way a
crashed one's do, through `participant_left` about 21 s later; tests remove them with `RoomServiceClient.removeParticipant`
instead of waiting.

Alternatives for the kind: `egress` marks the LiveKit room `activeRecording`; a hidden `standard` participant counts as
an attendee in the OpenVidu dashboard and keeps the room open until the empty timeout. Alternatives for coordination: a
Redis lease naming the replica that owns each meeting (rejected by the user, it duplicates what the media server already
knows); a WebSocket from each browser to the backend (rejected by the user); a separate saver service (rejected for the
extra piece in every topology).

### What the browser sends

Whether a meeting saves its chat is read from the config in the LiveKit room's metadata (`chat.enabled` and
`chat.persist` true, `e2ee` off), as the saver reads it, not from the room config loaded on the join screen, which can
be older than the meeting. In a meeting that saves, `ChatService` adds `MEET_CHAT_SAVER_IDENTITY` to
`destinationIdentities`, even when no other participant reads the chat, and sets the text stream attribute
`meet.messageId` to a random UUID.

It keeps the unconfirmed messages in an ordered in-memory buffer. While the buffer holds an unconfirmed message, a new
message is sent live to the readers without the saver and joins the end of the buffer; with no reader it only joins the
buffer, since a text stream without destinations reaches every participant. A message whose first send throws (the
connection is lost) is neither shown nor added to the buffer, as today: only a message the media server accepted waits
for its confirmation. The buffer sends the saver only
its oldest message, again every 5 s until it is confirmed, and the next one as soon as the previous one is confirmed, so
the saver stores each sender's messages in the order they were sent and the other participants never get a second copy.
The buffer is emptied when the participant leaves, reloads the page or loses `chatWrite` or `chatRead` (publishing
data needs both).

When a remote participant becomes a reader (every `ParticipantConnected` of a participant holding `canReadChat`,
including an identity that comes back after a reload or a full reconnect, or a connected one whose `canReadChat` turns
true), `ChatService` sends the 20 newest messages still in its buffer (`MAX_FORWARDED_CHAT_MESSAGES`, the size of a history page), in order, to that identity only, with the text
stream attribute `meet.forwarded: true`. That participant never received them, so this is a first delivery, not a
copy; it is the one exception to resending to the saver only. The buffer itself has no limit, so every message is stored once the saver confirms again;
an older unconfirmed message reaches that participant only through the history, when they reload or reconnect after it
is stored. The receiver treats a forwarded message like a loaded
one: no notice, no sound, no unread count, merged by sender identity and `messageId`, so it is shown once when the
history later loads it too; it goes at the end of the list, like a live message, and keeps that place when a history
page returns it. In every room, a chat message that arrives while the receiver's chat is still hidden (after a grant, the sender
sees the new permission before the receiver's token is renewed, and `ChatService` drops chat messages until then),
forwarded or live, is kept and shown quietly when the chat appears in the same meeting. The history read cannot do this instead: the server cannot wait for messages it has not
received yet, which is where they are while they sit in a sender's buffer.

The ids of the messages it sent in the current meeting are kept, each with the identity it was sent under, through
`BrowserStorageService` (local, one key per room holding the current meeting's sid and its `[messageId, identity]` pairs,
replaced when that room's meeting changes, since the service cannot list keys to drop older ones). A loaded message counts as the
participant's own when its sender identity is theirs, or when both its id and its sender identity match a kept pair, so
an anonymous participant recognizes their messages after a reload and a copied id never makes someone else's message
theirs.

### Storing and confirming

The saver connects with `dataStream: { maxPayloadByteLength: 2000 }`, so the binding ends a larger stream with an error
and the handler drops it unconfirmed; the handler also stops reading a stream that has not ended 10 s after it started
and drops it unconfirmed, before any other check. It then drops a stream whose `meet.messageId` is missing or not a UUID. A
stream with a valid `meet.messageId` whose text is refused (empty after trimming, which the interface can send as a lone
line break, tab or non-breaking space, or over 500 UTF-16 code units, `String.length`, which is what the input's
`maxlength` counts) is confirmed without being stored, so it never holds the sender's buffer; only an unknown sender and a
failed write leave a message unconfirmed. It takes the sender's name and type (Meet metadata: `userId`, `memberId` or
neither) from the participants it keeps; a stream from a sender it does not know yet is dropped unconfirmed, and the
resend stores it.

It writes `{ schemaVersion, roomId, meetingId: LiveKit room sid, meetingStartDate (from the LiveKit room metadata,
MeetRoomHelper.extractMeetingStartDateFromMetadata, or the LiveKit room's creation time when it carries none),
messageId, channel: 'all', text, participant: { identity, name, type } }` into a new `chat_messages` collection with a
pipeline upsert (Mongoose `updatePipeline: true`) whose filter is the unique key `(roomId, participant.identity,
messageId)` plus `sendDate: { $exists: false }`, and whose single stage `$set`s the message and `sendDate: { $toLong:
'$$NOW' }`. Every value of that stage except `sendDate` is wrapped in `$literal`, since a pipeline reads a string that
starts with `$` (a text such as `$5 off`, a display name) as a field path. A first write inserts the message with MongoDB's time in milliseconds. Every stored message has a
`sendDate`, so a resend matches nothing, tries an insert and fails on the unique key; that duplicate-key error counts as
stored and is confirmed, so a stored `sendDate` never changes. The key includes the identity so a participant who copies another's `messageId` cannot keep that message out
of the history. `schemaVersion` is a new `CHAT_MESSAGE_SCHEMA_VERSION` 1 in the internal config, registered in the
migration registry, as the api-key collection is at version 1 with no migrations.

After the write, or its duplicate-key error, the server confirms with `RoomServiceClient.sendData` to the sender only,
topic `meet_chat_message_saved`, a new `MeetSignalType` carrying the `messageId`: the user's decision is that the
server, not the hidden participant, confirms. Any other failed write sends nothing, so the browser sends again.

`sendDate` is MongoDB's time, so the history orders by when each message was stored, whichever replica stored it. One
sender's messages keep their order because the buffer sends the saver one message at a time; two senders whose messages
were stored after an outage keep the order their resends arrived in. `sendDate` is a number of milliseconds like every
other Meet date, so the history read reuses the repositories' `findMany` paging unchanged. The read index is
`(roomId, meetingId, sendDate, _id)`.

### Reading the history

`GET /internal-api/v1/meetings/{roomId}/chat/messages?maxItems=20&nextPageToken=` (operationId `chatListMessages`,
internal OpenAPI). It needs a room member token of that room with `chatRead` and a `participantIdentity` that is in the
meeting, checked with `MeetingService.isInMeeting` as the reaction route checks its sender (standard participants only;
the history route lives in `MeetingService`, or `isInMeeting`, `protected` today, becomes public). Unlike the reaction
route it does not go through `inActiveMeeting`, which answers `404` without a meeting: with no meeting in progress the
caller is not in one and gets `403`. It answers:

- `401` without a token, or with a revoked one such as a kicked participant's (`meeting-moderation`);
- `403` with a token of another room, without `chatRead`, without a participant identity (a token that does not join),
  or whose participant is not in the meeting (waiting, left, or no meeting in progress);
- `422` and `400` for `maxItems` and `nextPageToken` under the rules of `roomList`;
- `503` when LiveKit refuses the connection; the active meeting's LiveKit room (its sid and metadata) is read after
  `isInMeeting`, through a read that maps a refused connection to `errorLivekitNotAvailable` as
  `LiveKitService.getParticipant` does, since `LiveKitService.getRoom` answers `500` for it today;
- an empty page when the meeting does not save its chat (the config in that LiveKit room's metadata, as the saver reads
  it); otherwise the active meeting's messages (filtered on its LiveKit room sid), newest first, sorted by
  `(sendDate, _id)` descending, with the usual `{ items, pagination: { isTruncated, nextPageToken, maxItems } }`.

The query takes the room's settings as input, so the next change adds the `history` filter and the former-member check
without changing the route.

The type of a stored message, `MeetChatMessage`, goes into `meet-ce/typings/src/` with its TSDoc; this change uses it
only through the internal API. Its `sendDate` is a number of milliseconds and its `participant.type` is
`MeetParticipantType | 'system'`, leaving the public `MeetParticipantType` of the participant responses unchanged.

### Room config and migration

`MeetChatConfig` gains `persist: boolean`, and a new `MeetChatConfigOptions` (`persist?: boolean`) types
`MeetRoomConfigOptions.chat` and the backend `ChatConfigSchema`, as `MeetBroadcastConfigOptions` does for `broadcast`,
so a request may leave `persist` out.

The create schema's transform fills `chat.persist` (`true`) when the `chat` object omits it, as it does for
`recording.layout`, before `disableFeaturesExcludedByE2EE` runs (or before the service applies it, once
`fix-captions-off-with-encryption-in-wizard` moves it there). The default object used when `config` is absent also gets
`persist: true`, since zod 4 returns a default without running the transform. The chat schema shared with the update
keeps it optional with no default, so an update that leaves it out keeps the stored value. `disableFeaturesExcludedByE2EE`
sets `persist` false.

Room schema 10 to 11 sets `persist: false` on every existing room, with a new `MIGRATION_REV`. The OpenAPI room config
schema documents the field.

### Deleting the history

Every path that deletes a room (`deleteMeetRoom`, `bulkDeleteMeetRooms`, the deletion pending at meeting end, the
expired-rooms sweep) also deletes the room's `chat_messages`. Removing a member or a user touches nothing.

### Chat panel

In a meeting that saves its chat (the config in the LiveKit room's metadata, see `What the browser sends`),
`ChatService` loads the history once the LiveKit room is connected and the participant holds `chatRead`:

- on join and on reload: the first page;
- on a grant during the meeting, whether it comes from a member update or a user role change
  (`MEET_PARTICIPANT_PERMISSIONS_UPDATED`) or from a promotion (LiveKit metadata), once the participant's token has been
  renewed with `chatRead`, since the read checks the token: the first page;
- on the LiveKit room's `Reconnected` event, after a resume or a full reconnect: pages from the newest until one holds a
  message the panel had when the connection was lost, or the history ends (with nothing shown, the first page only), so
  no gap is left however many messages were missed. Two kinds of message do not end that search, because the server can
  store them after the missed ones: the participant's own messages that were unconfirmed when the connection was lost,
  and anything shown since it came back. Messages sent while the connection was lost may arrive live or only through the history; a live
  chat message received between `SignalReconnecting` or `Reconnecting` (the pinned livekit-client emits only
  `SignalReconnecting` on a resume, `Reconnecting` on a full reconnect) and the answer to that load raises no notice and
  adds no unread count, so either way they appear once and quietly. The loaded messages not shown yet go where the
  connection was lost, in the history's order: after the messages received before it dropped and before those received
  since.

The request sends `HTTP_HEADERS.SKIP_AUTH_RECOVERY`, as the occupancy read does (`meeting-livekit.service.ts`), so a
`401` or `403` is only logged and never regenerates the room member token. A page answered after the participant left
the meeting is discarded. Loaded messages never notify: they are not new
messages in the sense of `New-message notice`. They merge with the live ones by sender identity and `messageId` (live
messages carry the same attribute), so a message seen live and then loaded, or sent again, is shown once. The next page
loads when the list is scrolled to the top; prepending a page keeps the scroll position on the message that was at the
top, and only an appended (live) message scrolls to the newest, so the panel's scroll effect, which today scrolls to
the bottom on any change of the list, changes. The toolbar's unread count, which today counts any growth of
`chatMessages` (`ToolbarComponent.chatMessagesEffect`), counts only messages added live. A failed load is logged and
leaves the live messages.

Messages of other anonymous participants get the "Anonymous" label in every room, from the sender's metadata for live
messages and from `participant.type` for loaded ones; a participant's own messages show as their own, without it. An
encrypted room's panel says messages are not saved.

### Room wizard

The Meeting step adds the "Save the room's chat" toggle under the chat toggle, disabled as the spec says (with chat
off it keeps its value, as the chat permissions do; with encryption on it is off), and the
encryption restrictions gain the chat line. Turning encryption on keeps the toggle's value aside and turning it off
restores it, through `setE2EEEnabled`'s remember-and-restore of `E2EE_EXCLUSIVE_FEATURES`, with an entry (e.g.
`chatPersist`) whose control is the saving toggle and whose patch writes `config.chat.persist`, not
`config.chat.enabled`. The saving toggle never calls `setFeatureEnabled`: it is disabled while encryption is on, so
turning it on never has to turn encryption off. Encryption also goes off when recording or live broadcast is allowed
from their steps (`setFeatureEnabled`), and back on when they are disallowed again (`patchE2EE(true)`), neither of which
restores or turns off anything today; `fix-captions-off-with-encryption-in-wizard` routes those changes through the
same remember-and-restore, so every change of the encryption value, in both directions, keeps the toggle right.

### Docker image

The `prod-deps` stage moves from `node:24.22.3-alpine` to `node:24.22.3-slim` and the `production` stage from
`node:24-alpine` to `node:24-slim` (`apt-get upgrade`, `tzdata`, same removal of npm, npx, corepack and yarn), keeping
whatever Node pin the Dockerfile carries when this is implemented. `entrypoint.sh` stops node with
`kill -TERM "$node_pid"` instead of `pkill`, which Debian slim does not ship, and its trap waits for node to exit, since
today the script exits first. `prod-deps` already runs on the target platform, so `pnpm deploy` installs the
`linux-x64-gnu` or `linux-arm64-gnu` binding. Measured: 455 MB to 579 MB on disk and 94 MB to 123 MB to download, of
which 16 MB is Debian and 12.5 MB the binding.

## Several replicas

Any replica can host a meeting's saver; at most one connection per meeting survives a race; a stopped replica's savers
are rejoined by whoever receives their `participant_left`, or by the next participant join, or by the room status sweep
if every replica restarted. MongoDB's unique index makes resends and duplicates idempotent across replicas, and its
clock orders their writes. The history read is a plain query, served the same by any replica.

## Risks / Trade-offs

- [One WebRTC connection per meeting that saves, on the replica that joined it] → measure memory and CPU of 50 savers
  in one backend before merging; the connection carries data only (no subscriptions).
- [The Meet server must reach media nodes over WebRTC in Elastic and HA] → verify on an Elastic deployment before
  merging; documented for operators.
- [A native crash in the binding takes the whole backend down] → none in the trial; reported upstream if seen.
- [Debian slim shows more low-severity CVEs in scanners than Alpine] → accepted with the image change.
- [`ensureSaver` costs one LiveKit API call per join in rooms that save] → acceptable at join rates.
- [A saver joining as LiveKit closes the room recreates it] → the room carries the saver's metadata and a 1 s empty
  timeout: Meet ignores its webhooks, a join token request waits for it to close and LiveKit closes it by itself; no
  Meet webhook is sent.
- [A participant who reconnects straight to LiveKit with a still valid token during that second lands in a room Meet
  ignores] → it holds no Meet meeting, and the next join token request deletes it after its wait. Two join token
  requests that both outlive the wait each delete it by name, and the later delete can remove the meeting's room the
  other just created; it takes that reconnection and two joins in the same instant, accepted.
- [A restarted server finds its own dead saver still listed for about 21 s and skips it] → it rejoins on that saver's
  `participant_left`, on the next participant join or on the next room status sweep; senders resend meanwhile.
- [The saver's `participant_left` never reaches a replica] → the meeting has no saver until the next participant joins
  or the next room status sweep, at most `ROOM_ACTIVE_VERIFICATION_GC_INTERVAL` (15 minutes); senders keep resending,
  and only one who leaves in that time loses their unconfirmed messages.
- [After a replica crash the meeting has no saver for about 21 s] → its messages are confirmed late, once their senders
  send them again; only a sender who leaves within that window loses them.
- [A message whose sender leaves unconfirmed is lost] → accepted by the user for phase 1.
- [History order is MongoDB's storing order] → it keeps each sender's order; only an outage reorders senders.
- [A participant who joins while a message is unconfirmed (one round trip normally, longer during a burst, a storage
  outage or after a replica crash) gets no live copy] → its sender forwards it to them. Only a message confirmed just
  before its sender sees the newcomer but stored after the newcomer's history loads can still be missed until they
  reload: a network race of milliseconds, accepted by the user.
- [While nothing is confirmed (a long storage outage, no WebRTC reach to the media server) every sender's buffer grows
  and each newcomer gets the 20 newest messages of every sender present] → the buffers are bounded by the meeting and
  the burst by the cap; older unconfirmed messages reach a newcomer only after a reload, once stored.
- [A reader whose connection drops while a message is unconfirmed, and comes back before it is stored, gets it neither
  live nor from the history they reload] → it appears when they reload the page; it takes a storage outage or a saver
  gap at the same time as their connection loss.
- [After a reconnection, another sender's message that was shown before the drop while still unconfirmed, and stored
  after messages missed during it, ends the search early] → the older missed messages appear on a reload; same
  coincidence as above.
- [A modified client can send a message to the saver only] → the history holds a message nobody saw live, under its real
  sender; nothing is forged.
- [A write in flight when its room is deleted can be stored after the room's messages were deleted] → one message of a
  deleted room stays stored and is never served, since room ids are not reused.
- [An image that builds on this backend and stays on Alpine fails when the binding loads] → it moves to a glibc base in
  the same release.

## Migration Plan

Forward-only room migration at startup under the migration lock. Existing rooms keep live-only chat. No rollback to a
previous version (deployments never mix versions).
