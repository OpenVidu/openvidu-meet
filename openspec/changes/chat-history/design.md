# Design

## Context

Chat messages travel today as LiveKit text streams with topic `chat`, published by the sender's browser with
`destinationIdentities` set to the remote participants holding `chatRead`; the server never sees them. The backend
talks to LiveKit only through its HTTP API and receives LiveKit webhooks, deduplicated per event by the webhook lock.

Every place that lists, counts or announces participants filters them with `MeetParticipantHelper.isStandardParticipant`
(kind `STANDARD`), except `LiveKitService.participantExists` and `LiveKitService.roomHasParticipants` (used by
`recordingStart`, `broadcastStart` and the stale recording sweep), which count every LiveKit participant. This change
makes `roomHasParticipants` ignore the chat saver; every other participant counts as today. LiveKit's own
`maxParticipants` check, which Meet sets when it creates the LiveKit room, and its empty-room close both ignore
agent-kind participants. LiveKit creates a room when a participant joins one that does not exist (`auto_create`), and
Meet already relies on that.

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
can produce), the participant attribute `meet.role: chatSaver`, token kind `agent` and grant `{ roomJoin, room,
hidden: true, agent: true, canSubscribe: true, canPublish: false, canPublishData: false }`: the permissions of an
egress, without its kind, so the room is never reported as recording. It keeps the participants the room reports, with
their name and Meet metadata, and registers a text stream handler for topic `chat`.

The LiveKit webhook handlers recognize it by identity, kind `AGENT`, `permission.hidden` and `meet.role` together,
before any other routing: its `participant_joined` is ignored, its `participant_left` triggers the rejoin below, and
neither reaches the Meet participant events or webhooks.

`ensureSaver(roomId)` joins only when all of these hold:

- the room has `chat.enabled` and `chat.persist` true and `e2ee` off;
- the LiveKit room exists, and its sid is read before joining;
- LiveKit answers that `MEET_CHAT_SAVER_IDENTITY` is not in it (read with `lk.room.getParticipant` and its
  `isNotFoundError`, as `roomHasParticipants` does); any other LiveKit error skips the join, so an outage never causes
  one;
- this replica is not opening a connection for that meeting and holds none that LiveKit lists. A connection it holds
  that LiveKit no longer lists (its network dropped while the process lived) is disconnected and replaced.

The saver's token carries a LiveKit room configuration whose metadata is `{ "createdBy": "meet-chat-saver" }`. LiveKit
applies it only when the saver's join creates the room (it closed meanwhile), so Meet's webhook filter, which ignores
rooms whose metadata is not its own, ignores that room's `room_started` and `room_finished`: no `meetingStarted`,
`meetingEnded` or `ensureSaver` follows. Once connected, if the LiveKit room has another sid than the one read before
joining, the saver leaves at once and deletes that LiveKit room when it holds no standard participant. `ensureSaver`
runs:

- on `room_started`, once the room is activated (never for a closed room or a stale event, which `handleRoomStarted`
  already returns early on);
- on `participant_joined` of a standard participant, so a lost webhook or a restart heals on the next join;
- on `participant_left` of the saver itself, while the room still has standard participants: whichever replica gets the
  webhook rejoins it. After a crash LiveKit sends it about 21 s later; the messages sent meanwhile go unconfirmed and
  their senders send them again to the new saver;
- in `validateRoomsStatusGC`, which runs once per cluster at startup and every `ROOM_ACTIVE_VERIFICATION_GC_INTERVAL`,
  for every active meeting.

The webhook handlers run inside the 5 s webhook lock, so they start `ensureSaver` without awaiting the connection, as
`startAutoRecordingIfNeeded` is started. The config cannot change during a meeting (`room-config`), so nothing reacts to
config updates. Two replicas racing both join with the same identity: LiveKit keeps the last one and disconnects the
other (`DUPLICATE_IDENTITY`), which the losing replica takes as a normal end and does not rejoin. A failed join (for
example, no WebRTC reach to the media server) is logged as an error naming the room and retried on the next trigger;
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

In a room that saves its chat, `ChatService` adds `MEET_CHAT_SAVER_IDENTITY` to `destinationIdentities`, even when no
other participant reads the chat, and sets the text stream attribute `meet.messageId` to a random UUID.

It keeps the unconfirmed messages in an ordered in-memory buffer. While the buffer holds an unconfirmed message, a new
message is sent live to the readers without the saver and joins the end of the buffer. The buffer sends the saver only
its oldest message, again every 5 s until it is confirmed, and the next one as soon as the previous one is confirmed, so
the saver stores each sender's messages in the order they were sent and the other participants never get a second copy.
The buffer is emptied when the participant leaves, reloads the page or loses `chatWrite` or `chatRead` (publishing
data needs both).

When a remote participant becomes a reader (a new identity with `canReadChat`, or an existing one whose `canReadChat`
turns true), `ChatService` sends every message still in its buffer, in order, to that identity only, with the text
stream attribute `meet.forwarded: true`. That participant never received them, so this is a first delivery, not a
copy; it is the one exception to resending to the saver only. The receiver treats a forwarded message like a loaded
one: no notice, no sound, no unread count, merged by sender identity and `messageId`, so it is shown once when the
history later loads it too. The history read cannot do this instead: the server cannot wait for messages it has not
received yet, which is where they are while they sit in a sender's buffer.

The ids of the messages it sent in the current meeting are kept, each with the identity it was sent under, through
`BrowserStorageService` (local, keyed by room and meeting, older meetings dropped). A loaded message counts as the
participant's own when its sender identity is theirs, or when both its id and its sender identity match a kept pair, so
an anonymous participant recognizes their messages after a reload and a copied id never makes someone else's message
theirs.

### Storing and confirming

The saver handler stops reading a stream once it passes 2,000 bytes and drops it, before any other check. It then drops
a stream whose `meet.messageId` is missing or not a UUID. A stream with a valid `meet.messageId` whose text is refused
(empty after trimming, which the interface can send as a lone line break, tab or non-breaking space, or over 500
characters) is confirmed without being stored, so it never holds the sender's buffer; only an unknown sender and a
failed write leave a message unconfirmed. It takes the sender's name and type (Meet metadata: `userId`, `memberId` or
neither) from the participants it keeps; a stream from a sender it does not know yet is dropped unconfirmed, and the
resend stores it.

It writes `{ schemaVersion, roomId, meetingId: LiveKit room sid, meetingStartDate (from the LiveKit room metadata,
MeetRoomHelper.extractMeetingStartDateFromMetadata, or the LiveKit room's creation time when it carries none),
messageId, channel: 'all', text, participant: { identity, name, type } }` into a new `chat_messages` collection with a
pipeline upsert (Mongoose `updatePipeline: true`) whose filter is the unique key `(roomId, participant.identity,
messageId)` plus `sendDate: { $exists: false }`, and whose single stage `$set`s the message and `sendDate: { $toLong:
'$$NOW' }`. A first write inserts the message with MongoDB's time in milliseconds. Every stored message has a
`sendDate`, so a resend matches nothing, tries an insert and fails on the unique key; that duplicate-key error counts as
stored and is confirmed, so a stored `sendDate` never changes. The key includes the identity so a participant who copies another's `messageId` cannot keep that message out
of the history. `schemaVersion` is a new `CHAT_MESSAGE_SCHEMA_VERSION` 1 in the internal config, registered in the
migration registry like every collection's.

After the write, or its duplicate-key error, the server confirms with `RoomServiceClient.sendData` to the sender only,
topic `meet_chat_message_saved`, a new `MeetSignalType` carrying the `messageId`: the user's decision is that the
server, not the hidden participant, confirms. Any other failed write sends nothing, so the browser sends again.

`sendDate` is MongoDB's time, so the history orders by when each message was stored, whichever replica stored it. One
sender's messages keep their order because the buffer sends the saver one message at a time; two senders whose messages
were stored after an outage keep the order their resends arrived in. `sendDate` is a number of milliseconds like every
other Meet date, so the history read reuses the repositories' `findMany` paging unchanged. The read index is
`(roomId, meetingId, sendDate, _id)`.

### Reading the history

`GET /internal-api/v1/meetings/{roomId}/chat/messages?maxItems=20&nextPageToken=` (operationId `chatMessageList`,
internal OpenAPI). It needs a room member token of that room with `chatRead` and a `participantIdentity` that is in the
meeting, checked with `MeetingService.isInMeeting` as the reaction route checks its sender (standard participants only;
the history route lives in `MeetingService`, or `isInMeeting`, `protected` today, becomes public). It answers:

- `401` without a token, or with a revoked one such as a kicked participant's (`meeting-moderation`);
- `403` with a token of another room, without `chatRead`, without a participant identity (a token that does not join),
  or whose participant is not in the meeting (waiting, left);
- `422` and `400` for `maxItems` and `nextPageToken` under the rules of `roomList`;
- `503` when LiveKit refuses the connection; the active meeting's sid is read after `isInMeeting`, and a refused
  connection there also answers `503`;
- an empty page when the room does not save its chat; otherwise the active meeting's messages (filtered on its LiveKit
  room sid), newest first, sorted by `(sendDate, _id)` descending, with the usual `{ items, pagination: { isTruncated,
  nextPageToken, maxItems } }`.

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

In a room that saves its chat (the room config the meeting already loads), `ChatService` loads the history once the
LiveKit room is connected and the participant holds `chatRead`:

- on join and on reload: the first page;
- on a grant during the meeting, whether it comes from a member update or a user role change
  (`MEET_PARTICIPANT_PERMISSIONS_UPDATED`) or from a promotion (LiveKit metadata), once the participant's token has been
  renewed with `chatRead`, since the read checks the token: the first page;
- on the LiveKit room's `Reconnected` event, after a resume or a full reconnect: pages from the newest until one holds a
  message already shown, or the history ends (with nothing shown, the first page only), so no gap is left however many
  messages were missed. Messages sent while the connection was lost may arrive live or only through the history; a live
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

The Meeting step adds the "Save the room's chat" toggle under the chat toggle, disabled as the spec says, and the
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
- [A saver joining as LiveKit closes the room recreates it] → the room carries the saver's metadata, Meet ignores its
  webhooks and the saver deletes it; no Meet webhook is sent.
- [A restarted server finds its own dead saver still listed for about 21 s and skips it] → it rejoins on that saver's
  `participant_left`, on the next participant join or on the next room status sweep; senders resend meanwhile.
- [After a replica crash the meeting has no saver for about 21 s] → its messages are confirmed late, once their senders
  send them again; only a sender who leaves within that window loses them.
- [A message whose sender leaves unconfirmed is lost] → accepted by the user for phase 1.
- [History order is MongoDB's storing order] → it keeps each sender's order; only an outage reorders senders.
- [A participant who joins while a message is unconfirmed (one round trip normally, longer during a burst, a storage
  outage or after a replica crash) gets no live copy] → its sender forwards it to them. Only a message confirmed just
  before its sender sees the newcomer but stored after the newcomer's history loads can still be missed until they
  reload: a network race of milliseconds, accepted by the user.
- [An image that builds on this backend and stays on Alpine fails when the binding loads] → it moves to a glibc base in
  the same release.

## Migration Plan

Forward-only room migration at startup under the migration lock. Existing rooms keep live-only chat. No rollback to a
previous version (deployments never mix versions).
