# Design

## Context

Chat messages travel today as LiveKit text streams with topic `chat`, published by the sender's browser with
`destinationIdentities` set to the remote participants holding `chatRead`; the server never sees them. The backend
talks to LiveKit only through its HTTP API and receives LiveKit webhooks, deduplicated per event by the webhook lock.
Every place that lists, counts or announces participants filters them with `MeetParticipantHelper.isStandardParticipant`
(kind `STANDARD`), except `LiveKitService.participantExists` and `LiveKitService.roomHasParticipants` (used by `recordingStart`,
`broadcastStart` and the stale recording sweep), which count every LiveKit participant; this change makes
`roomHasParticipants` count standard ones only. In the stale-recording sweep this makes a stale egress in a room with
no standard participant stop slightly earlier, while the room waits to close; nothing else changes. LiveKit's own `maxParticipants` check, which Meet sets when it creates the LiveKit room, and its
empty-room close both ignore agent-kind participants. `MeetRoomHelper.disableFeaturesExcludedByE2EE` already turns
recording, broadcast and captions off for encrypted rooms. Room schema is at version 10.

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

**Goals:** store every message of a room that saves its chat once, with the sender LiveKit reports; serve it under the
current meeting's participants; survive a replica or MongoDB outage while the sender stays.

**Non-Goals:** recovering messages whose sender left unconfirmed (future: ask other participants); any public read of the
history; showing earlier meetings, the `history` setting and the "Former member" label
(`chat-history-across-meetings`); webhooks or embedded events (`chat-integration-api`); saving in encrypted rooms.

## Decisions

### The chat saver: one hidden, subscribe-only participant per meeting

A `ChatSaverService` in the backend holds, per meeting it saves, one `@livekit/rtc-node` `Room` connected through
`LIVEKIT_URL_PRIVATE` with `autoSubscribe: false`, identity `MEET_CHAT_SAVER_IDENTITY` (a constant no Meet credential
can produce), the participant attribute `meet.role: chatSaver`, token kind `agent` and grant `{ roomJoin, room, hidden: true, agent: true, canSubscribe: true,
canPublish: false, canPublishData: false }`: the permissions of an egress, without its kind, so the room is never
reported as recording. It keeps the participants the room reports, with their name and Meet metadata, and registers a
text stream handler for topic `chat`.

The LiveKit webhook handlers recognize it by identity, kind `AGENT`, `permission.hidden` and `meet.role` together, before any other
routing: its `participant_joined` is ignored, its `participant_left` triggers the rejoin below, and neither reaches the
Meet participant events or webhooks.

`ensureSaver(roomId)` joins only when the room has `chat.enabled` and `chat.persist` true and `e2ee` off, the LiveKit
room exists, and LiveKit answers that `MEET_CHAT_SAVER_IDENTITY` is not in it; any other LiveKit error skips the join,
so an outage never causes one. It runs:

- on `room_started`, once the room is activated (never for a closed room or a stale event, which `handleRoomStarted`
  already returns early on);
- on `participant_joined` of a standard participant, so a lost webhook or a restart heals on the next join;
- on `participant_left` of the saver itself, while the room still has standard participants: whichever replica gets the
  webhook rejoins it. After a crash LiveKit sends it about 21 s later; the messages sent meanwhile go unconfirmed and
  their senders send them again to the new saver;
- in `validateRoomsStatusGC`, which runs once per cluster at startup and every `ROOM_ACTIVE_VERIFICATION_GC_INTERVAL`,
  for every active meeting.

The webhook handlers run inside the 5 s webhook lock, so they start `ensureSaver` without awaiting the connection, as
`startAutoRecordingIfNeeded` is started. The config cannot change during a meeting (`room-config`), so nothing reacts to config updates. Two replicas racing
both join with the same identity: LiveKit keeps the last one and disconnects the other (`DUPLICATE_IDENTITY`), which
the losing replica takes as a normal end and does not rejoin. A failed join (for example, no WebRTC reach to the media
server) is logged as an error naming the room and retried on the next trigger; the meeting goes on unsaved. The saver
leaves when LiveKit closes the room, on the usual
departure timeout, or when the meeting is ended. The `Room` objects are the only per-replica state, and they are live
connections that LiveKit's webhooks recover, not request state. The backend has no shutdown handler, so a stopped
replica's savers leave the way a crashed one's do, through `participant_left` about 21 s later.

Alternatives for the kind: `egress` marks the LiveKit room `activeRecording`; a hidden `standard` participant counts as
an attendee in the OpenVidu dashboard and keeps the room open until the empty timeout. Alternatives for coordination: a
Redis lease naming the replica that owns each meeting (rejected by the user, it duplicates what the
media server already knows); a WebSocket from each browser to the backend (rejected by the user); a separate saver
service (rejected for the extra piece in every topology).

### What the browser sends

In a room that saves its chat, `ChatService` adds `MEET_CHAT_SAVER_IDENTITY` to `destinationIdentities`, even when no
other participant reads the chat, and sets the text stream attribute `meet.messageId` to a random UUID. It keeps the
unconfirmed messages in an ordered in-memory buffer. While the buffer holds an unconfirmed message, a new message is
sent live to the readers without the saver and joins the end of the buffer. The buffer sends the saver only its oldest
message, again every 5 s until it is confirmed, and then the next one as soon as the previous one is confirmed, so the saver stores each sender's messages in the
order they were sent and the other participants never get a second copy. A reload empties the buffer, which counts as
leaving. The ids
of the messages it sent in the current meeting are kept through `BrowserStorageService` (local, keyed by room and
meeting, older meetings dropped), so an anonymous participant recognizes their messages after a reload.

### Storing and confirming

The saver handler stops reading a stream once it passes 2,000 bytes and drops it, before any other check. It then drops
a stream without `meet.messageId`, empty after trimming, or over 500 characters. It takes the sender's name and type
(Meet metadata: `userId`, `memberId` or neither) from the participants it keeps, and inserts `{ roomId, meetingId:
LiveKit room sid, meetingStartDate, messageId, channel: 'all', sendDate: now, text, participant: { identity, name, type
} }` into a new `chat_messages` collection with a unique index on `(roomId, participant.identity, messageId)`, so a
participant who copies another's `messageId` cannot keep that message out of the history. A duplicate key is confirmed
again. After the insert, or on a duplicate, the server confirms with `RoomServiceClient.sendData` to the sender only,
topic `meet_chat_message_saved`, a new `MeetSignalType` carrying the `messageId`: the user's decision is that the
server, not the hidden participant, confirms. A failed insert sends nothing, so the browser sends again.

`sendDate` is the server's time, so the history orders by when the server stored each message. One sender's messages
keep their order because the buffer sends the saver one message at a time; two senders whose messages were stored after
an outage keep the order their resends arrived in. The read index is `(roomId, meetingId, sendDate, _id)`.

### Reading the history

`GET /internal-api/v1/meetings/{roomId}/chat/messages?maxItems=20&nextPageToken=` (operationId `chatMessageList`,
internal OpenAPI), room member token of that room with `chatRead` and a `participantIdentity` that LiveKit lists in the
room (`MeetingService.isInMeeting`, as the reaction route checks its sender: standard participants only, `503` when
LiveKit is unreachable): without a token `401`; with one of another room, without `chatRead`, without a participant
identity (a token that does not join) or whose participant is not in the meeting (waiting, left) `403`; a kicked
participant's tokens are already revoked, so they get `401` (`meeting-moderation`). It answers an empty page when the
room does not save its chat, and otherwise filters on the active meeting's LiveKit room sid (empty without an active
meeting). Pages are newest first, sorted by `(sendDate, _id)` descending, with the usual `{ items, pagination: {
isTruncated, nextPageToken, maxItems } }`. The query takes the room's settings as input, so the next change adds the
`history` filter and the former-member check without changing the route.

The type of a stored message, `MeetChatMessage`, goes into `meet-ce/typings/src/` with its TSDoc; this change uses it
only through the internal API. Its `participant.type` is `MeetParticipantType | 'system'`, leaving the public
`MeetParticipantType` of the participant responses unchanged.

### Room config and migration

`MeetChatConfig` gains `persist: boolean`, and a new `MeetChatConfigOptions` (`persist?: boolean`) types
`MeetRoomConfigOptions.chat` and the backend `ChatConfigSchema`, as `MeetBroadcastConfigOptions` does for `broadcast`, so
a request may leave `persist` out. The create schema's transform fills `chat.persist` (`true`) when the `chat`
object omits it, as it does for `recording.layout`; the default object used when `config` is absent also gets
`persist: true`, since zod 4 returns a default without running the transform. The chat schema shared with the update keeps it optional with no
default, so an update that leaves it out keeps the stored value. `disableFeaturesExcludedByE2EE` sets `persist` false.
Room schema 10 to 11 sets `persist: false` on every existing room, with a
new `MIGRATION_REV`. The OpenAPI room config schema documents the field.

### Deleting the history

Every path that deletes a room (`deleteMeetRoom`, `bulkDeleteMeetRooms`, the deletion pending at meeting end, the
expired-rooms sweep) also deletes the room's `chat_messages`. Removing a member or a user touches nothing.

### Chat panel

In a room that saves its chat (the room config the meeting already loads), `ChatService` loads the first page once the
LiveKit room is connected and the participant holds `chatRead` (join, reload, or a grant once the token has
been regenerated on `MEET_PARTICIPANT_PERMISSIONS_UPDATED`, since the read checks the token), marks loaded messages
so they never notify, merges them with the live ones by `messageId`, and loads the next page when the list is scrolled
to the top. Prepending a page keeps the scroll position on the message that was at the top; only an appended (live)
message scrolls to the newest, so the panel's scroll effect, which today scrolls to the bottom on any change of the
list, changes. Live messages carry the same `messageId`, and the panel merges by sender identity and `messageId`, so a
message seen live and then loaded, or sent again, is shown once. The toolbar's unread count, which today counts any
growth of `chatMessages` (`ToolbarComponent.chatMessagesEffect`), counts only messages added live. A failed load is logged and leaves the live messages.
Messages of anonymous senders get the "Anonymous" label. An encrypted room's panel says messages are not saved.

### Room wizard

The Meeting step adds the "Save the room's chat" toggle under the chat toggle, disabled as the spec says, and the
encryption restrictions gain the chat line. Turning encryption on keeps the toggle's value aside and turning it off
restores it, through `setE2EEEnabled`'s remember-and-restore of `E2EE_EXCLUSIVE_FEATURES`, with an entry (e.g.
`chatPersist`) whose control is the saving toggle and whose patch writes `config.chat.persist`, not
`config.chat.enabled`. The saving toggle never calls `setFeatureEnabled`: it is disabled while encryption is on, so
turning it on never has to turn encryption off. `fix-captions-off-with-encryption-in-wizard` extends the restore to
encryption turned off from the Recording step.

### Docker image

The `prod-deps` stage moves from `node:24.22.3-alpine` to `node:24.22.3-slim` and the `production` stage from
`node:24-alpine` to `node:24-slim` (`apt-get upgrade`, `tzdata`, same removal of npm, npx, corepack and yarn), keeping
whatever Node pin the Dockerfile carries when this is implemented. `entrypoint.sh` stops node with
`kill -TERM "$node_pid"` instead of `pkill`, which Debian slim does not ship, and its trap waits for node to exit, since
today the script exits first. `prod-deps` already runs on the target platform, so `pnpm deploy` installs the `linux-x64-gnu` or `linux-arm64-gnu` binding. Measured: 455 MB to 579 MB on disk and 94 MB to 123 MB to
download, of which 16 MB is Debian and 12.5 MB the binding.

## Several replicas

Any replica can host a meeting's saver; at most one connection per meeting survives a race; a stopped replica's savers
are rejoined by whoever receives their `participant_left`, or by the next participant join, or by the room status sweep
if every replica restarted. MongoDB's unique index makes resends and duplicates idempotent across replicas. The history
read is a plain query, served the same by any replica.

## Risks / Trade-offs

- [One WebRTC connection per meeting that saves, on the replica that joined it] → measure memory and CPU of 50 savers
  in one backend before merging; the connection carries data only (no subscriptions).
- [The Meet server must reach media nodes over WebRTC in Elastic and HA] → verify on an Elastic deployment before
  merging; documented for operators.
- [A native crash in the binding takes the whole backend down] → none in the trial; reported upstream if seen.
- [Debian slim shows more low-severity CVEs in scanners than Alpine] → accepted with the image change.
- [`ensureSaver` costs one LiveKit API call per join in rooms that save] → acceptable at join rates.
- [After a replica crash the meeting has no saver for about 21 s] → its messages are confirmed late, once their senders
  send them again; only a sender who leaves within that window loses them.
- [A message whose sender leaves unconfirmed is lost] → accepted by the user for phase 1.
- [History order is the server's storing order] → it keeps each sender's order; only an outage reorders senders.
- [A participant who joins while a message is still unconfirmed gets neither its live copy nor its history copy until
  they reload] → accepted: it only happens during a storage outage or the gap after a replica crash.
- [An image that builds on this backend and stays on Alpine fails when the binding loads] → it moves to a glibc base in
  the same release.

## Migration Plan

Forward-only room migration at startup under the migration lock. Existing rooms keep live-only chat. No rollback to a
previous version (deployments never mix versions).
