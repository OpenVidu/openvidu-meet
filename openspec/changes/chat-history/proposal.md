# Proposal

## Decisions

Phase 1 of the chat roadmap. The product and contract record is the review deck "Chat · Fases 1 a 5" (slides `cover`
to `dec-4`), where the user decided in comments between 2026-11-21 and 2026-11-26; the rest are the user's answers in
the session that opened this change.

- Phase 1 goes to OpenSpec as two changes: this one (the chat is saved and shown in the meeting) and
  `chat-integration-api` (REST system message, webhook and embedded event `chatMessageReceived`, command
  `chatSendMessage`): the user, 2026-11-26. The history across meetings was later split off from this one (below).
- The chat belongs to the room; a room setting decides whether earlier meetings are shown: the user, deck X1,
  2026-11-21.
- Two room settings, `config.chat.persist` (a "Save the room's chat" toggle) and `config.chat.history`, the answer to
  "People who join the meeting see": `none` (only new messages), `current_meeting` (what was said in the current
  meeting) or `all_meetings` (also earlier meetings), in snake_case like the other room config values. The question is
  disabled while saving is off. Labels say what the participant notices: the user, 2026-11-26.
- This change delivers `config.chat.persist` and the current meeting's history; `config.chat.history`, earlier
  meetings, the meeting separators and the "Former member" label go to the next change, `chat-history-across-meetings`,
  to keep each change small. This one still exceeds the 10-delta limit (19 with the forwarding requirement below and the notice requirement it touches), accepted because saving, resending, several
  replicas and invisibility are not useful apart: the user, 2026-11-26.
- New rooms save (`persist` `true`) and, with the next change, show `current_meeting`; rooms that existed before keep
  their behavior (`persist` `false`): the user, deck X4 and X5 (2026-11-21) and `history` default (2026-11-26).
- With end-to-end encryption nothing is saved and the chat stays as today; turning encryption on switches saving off,
  as it already does for recording, broadcast and captions: the user, deck X3 and X4, 2026-11-21.
- Only an encrypted room's chat panel says that messages are not saved; a room with saving off says nothing, as today:
  the user, deck mock of the encrypted room's chat panel, 2026-11-21.
- Anonymous participants' messages are saved too, under their display name with an "Anonymous" label: the user, deck X2,
  2026-11-21.
- A room that saves but does not show earlier meetings still stores them (D1.2); the history setting changes only in the
  room wizard, never from inside the meeting (D1.9): the user, 2026-11-26.
- Joining shows the last 20 messages and scrolling up loads earlier ones (D1.3); an anonymous participant's messages are
  shown as theirs again in the same meeting and the same browser (D1.4): the user, 2026-11-26.
- A removed member's messages are always kept and cannot be deleted; they are shown with their name and a "Former member"
  label (D1.5, D1.6); the label also applies to a deleted user account: the user, 2026-11-25 and 2026-11-26. The label
  comes with `chat-history-across-meetings`; this change keeps the messages.
- Turning saving off or turning encryption on hides what is stored; only deleting the room deletes it (D1.7): the user,
  2026-11-26.
- Transport: no WebSocket. A participant of Meet's own server, hidden from the meeting, joins the media server room and
  receives the chat over the data channel; the sender identity comes from the media server; history is served over
  REST: the user, 2026-11-25.
- One hidden participant per meeting, joined when the media server room starts (if the room saves, and none is in yet)
  and rejoined by whichever replica receives its departure (D1.10). It stores each message and the server confirms it to
  the author. Each browser keeps an ordered buffer of unconfirmed messages and sends them again after 5 s without
  confirmation (D1.11). No queue on the server, no Redis streams, no lease: the user, 2026-11-26.
- The participant `type` of a stored message reuses the values Meet already has (`user`, `identified_guest`,
  `anonymous`) and adds `system`: the user, 2026-11-26.
- "Former member" is worked out by the server when it serves the history (a removed member or a deleted user account);
  stored messages are never rewritten (in `chat-history-across-meetings`): the user, 2026-11-26.
- The server stores no empty message and none longer than 500 characters, from a modified client; there is no rate
  limit and no storage cap per room in phase 1: the user, 2026-11-26.
- An unconfirmed message is not marked on screen: it is internal state of the author's resend buffer. A message whose
  author leaves before it is confirmed is lost from the history. Asking other participants for those messages is a
  future idea, not part of phase 1: the user, 2026-11-26 (this replaces the visible "Not saved" mark of D1.8).
- A participant granted `chatRead` during the meeting loads the history as a late joiner would: the user, 2026-11-26.
- Only a participant who is in the meeting reads its history: a join token of the room with `chatRead` whose identity
  the media server lists in the meeting. A token that does not join, someone waiting or someone who left gets `403`,
  and a kicked participant `401` since a kick already revokes their tokens, so reading the history never reaches
  further than receiving the chat live: the user, 2026-11-26.
- The hidden participant is subscribe-only like an egress (it sees every participant and resolves each sender itself,
  receiving no media) but of LiveKit kind `agent`, so the OpenVidu dashboard shows it apart from the attendees and the
  room is never reported as recording; it carries the attribute `meet.role: chatSaver` and Meet recognizes it by
  identity, kind, `hidden` and that attribute: the user, 2026-11-26, after the trial showed that kind `egress` marks the
  room `activeRecording` and a hidden standard participant counts as an attendee in the dashboard.
- The saver is ensured when the media server room starts, on every standard participant's join, on its own departure
  while participants remain, and once at startup; replicas racing to join resolve by identity, with no lock: the user,
  2026-11-26. The startup run is the room status sweep each replica runs when it starts, which also repeats on its interval.
- Messages are sent again to the saver only, never to the other participants: the user, 2026-11-26. One exception: a
  sender's client sends its still unconfirmed messages, once, to each participant who starts reading the chat while
  they are unconfirmed (joins holding `chatRead` or is granted it), since that participant never received them, so
  someone who joins while a message is being saved does not miss it. A message confirmed just before its sender sees
  the newcomer but stored after the newcomer's history loads may be missing for them until they reload; that network
  race is accepted: the user, 2026-11-26, rather than making the history read wait, which cannot know about messages the
  server has not received yet.
- Of a sender's unconfirmed messages only the 20 newest are sent to a participant who starts reading; the sender keeps
  all of them, so all are stored once saving works again, and the newcomer sees the older ones after reloading or
  reconnecting: the user, 2026-11-26.
- When the media server's notice that the hidden participant left reaches no replica, the meeting stays unsaved until
  the next participant joins or the next room status sweep, at most 15 minutes; no mechanism is added for it: the user,
  2026-11-26.
- In the room wizard, while chat is off the saving toggle is shown disabled and keeps its value, like the chat
  permissions: the user, 2026-11-26.
- `MeetChatMessage` is exported from the typings in this change with provisional names; this change and
  `chat-integration-api` ship in the same release, so they can change until then: the user, 2026-11-26.
- In every room, saving or not, a message received after a `chatRead` grant and before the participant's chat appears
  is kept and shown when it appears, with no notice, sound or unread count; today it is dropped: the user, 2026-11-26.
- The history is ordered as the server stored it, which keeps each sender's order: the user, 2026-11-26.
- In the room wizard, turning encryption off again, from the Meeting, Recording or Live broadcast step, restores the saving toggle
  to the value it had, as it does for recording, broadcast and captions; the server never turns saving back on by
  itself: the user, 2026-11-26.
- When the history cannot be loaded, the chat panel shows the live messages and no error: the user, 2026-11-26.
- The "Anonymous" label is shown on every message of an anonymous sender, live or saved, in every room, including rooms
  that do not save their chat and encrypted ones, so one chat never labels the same person in two ways; a participant's
  own messages show as their own, without it: the user, 2026-11-26.
- When a participant's connection comes back after being lost, the chat panel of a room that saves its chat loads the
  history again and adds the messages sent meanwhile, once and without a notice: the user, 2026-11-26.
- When the Meet server cannot reach the media server over WebRTC, meetings and the live chat work, nothing is stored and
  the server logs an error naming the room each time it fails to join: the user, 2026-11-26.
- Before merging, one backend saving 50 meetings is measured and the saver is checked on an OpenVidu Elastic deployment:
  the user, 2026-11-26.
- The hidden participant runs in the backend with `@livekit/rtc-node`, which ships only glibc binaries; the production
  image moves from Alpine to Debian slim (+16 MB to download, measured): accepted by the user for now, 2026-11-26, to
  try the mechanism; to be confirmed with the trial's results before merging.

## Assumptions

- The English label "Anonymous" (chat).
- An anonymous participant's own messages are recognized after a reload from the ids the browser kept for that meeting.
- The history is read through the internal API, `/internal-api/v1`, so its route and shape carry no compatibility promise.
  The final field names of a stored message (`meetingId` included, a meeting identifier that no public contract carries
  today) are decided in `chat-integration-api` (see Decisions).

## Why

Today the chat lives only in the browsers of the participants who are in the meeting: someone who joins late, reloads
the page or comes back another day finds an empty chat. Rooms are durable, so their conversation should be too. Of the
platforms studied (Jitsi, BigBlueButton, plugNmeet, Whereby) none keeps the chat between meetings.

## What Changes

- New room setting `config.chat.persist`, in the REST API (`roomCreate`, `roomUpdateConfig`, `roomGetConfig`) and in the
  Meeting step of the room wizard. Existing rooms are migrated with `persist` `false`.
- In a room that saves, Meet's server joins each meeting as a hidden participant that stores every chat message with the
  sender the media server reports and the server's time. It does not appear anywhere a participant does: not in the
  participants list, the participant count, `maxParticipants`, webhooks or embedded events, and the meeting ends when it
  would without it.
- A participant who joins, reloads or is granted `chatRead` sees the current meeting's messages, the last 20 first and
  earlier ones on scrolling up, labelled with their sender; their own messages as their own.
- Each browser sends again the messages the server has not confirmed, every 5 s while the author stays in the meeting;
  a message is stored and shown once however many times it is sent.
- Messages of removed members and deleted users stay; messages of anonymous participants are labelled "Anonymous".
- End-to-end encryption, turning saving off or turning chat off hide what is stored; deleting the room deletes it.
- The production image moves to Debian slim and the backend gains `@livekit/rtc-node`; the Meet server must reach the
  media server over WebRTC, as a browser does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-chat`: saving the chat, what a participant who joins sees, senders and labels, resending, encryption, the
  wizard toggle, and the room's history being deleted with it; "Messages last only the meeting" narrows to rooms that
  do not save.
- `room-config`: the default of `chat.persist`, and end-to-end encryption turning chat saving off.
- `deployment`: Meet joins meetings as a participant, so it needs WebRTC reach to the media server.

## Impact

- **REST API**: `config.chat.persist` is added to the room config, additively. A new
  internal operation serves a room's history to a participant in the meeting who holds `chatRead`.
- **Webhooks**: `chat.persist` appears, additively, in the room config the `meetingStarted` and `meetingEnded` payloads
  carry. The hidden participant emits no `participantJoined` or `participantLeft`.
- **Embedded API**: none.
- **Typings** (`@openvidu-meet/typings`, additive): `MeetChatConfig.persist`, `MeetChatConfigOptions`, `MeetChatMessage`
  and `MeetSignalType.MEET_CHAT_MESSAGE_SAVED`, the `meet.messageId` and `meet.forwarded` attribute names and the chat saver identity constant.
- **Media server**: a LiveKit room that the hidden participant's join creates by accident (the meeting closed at that
  moment) carries its own metadata and closes by itself in about a second; Meet never treats it as a meeting.
- **Meeting UI**: the chat panel loads the current meeting's history on joining, reloading, being granted `chatRead` and
  reconnecting, and pages it; anonymous senders are labelled in every room; the sender keeps unconfirmed messages and
  sends them again.
- **Console UI**: the room wizard's Meeting step gains the saving toggle.
- **Deployment**: the `openvidu/openvidu-meet` image is based on Debian slim instead of Alpine; the backend opens WebRTC
  connections to the media server (`LIVEKIT_URL_PRIVATE`) for the meetings of rooms that save; a new MongoDB collection
  and a room migration. An image that builds on this backend must move to a glibc base in the same release, and derived
  images that install packages with `apk` must switch to `apt-get`.
- **openvidu.io** (`next`): `docs/meet/features/meetings/configuration.md` (the saving setting),
  `docs/meet/features/meetings/e2e-encryption.md` (chat not saved), `docs/meet/features/rooms/management.md` (history
  deleted with the room) and `docs/meet/deployment/overview.md` (WebRTC reach from Meet to the media server).
