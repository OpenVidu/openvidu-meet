# Spec Delta

## ADDED Requirements

### Requirement: Saving the room's chat
While a room has `config.chat.enabled` and `config.chat.persist` true and `config.e2ee.enabled` false, the server SHALL store every chat message of its meetings with the sender the media server reports and the time it stored it. A message that is empty, only spaces or over 500 characters SHALL be confirmed to its sender without being stored; one without the interface's message id SHALL be dropped. `config.chat.persist` SHALL be a boolean (`422` otherwise); earlier rooms have it `false`.

#### Scenario: Message stored
- **GIVEN** a room with chat enabled, `config.chat.persist` true and end-to-end encryption disabled
- **WHEN** a participant sends `hello` in its meeting
- **THEN** the room's history holds `hello` with that participant as its sender

#### Scenario: Room that does not save
- **GIVEN** a room with `config.chat.persist` false
- **WHEN** a participant sends `hello` in its meeting
- **THEN** the participants in the meeting see `hello` and the room's history does not hold it

#### Scenario: Oversized message
- **GIVEN** a meeting of a room that saves its chat
- **WHEN** a modified client sends a 501-character message
- **THEN** the room's history does not hold it

#### Scenario: Blank message
- **GIVEN** a meeting of a room that saves its chat
- **WHEN** a participant's client sends a message that is only a line break, and then `hello`
- **THEN** the room's history holds `hello` and not the blank message

#### Scenario: Non-boolean persist
- **WHEN** `roomCreate` is called with `config.chat.persist` set to the string `"true"`
- **THEN** the server answers `422` naming `chat.persist` and no room is created

#### Scenario: Chat switched off keeps its saving setting
- **GIVEN** a room with `config.chat.persist` true
- **WHEN** `roomUpdateConfig` is called with `config` `{ "chat": { "enabled": false } }`
- **THEN** its `chat.persist` stays `true`

#### Scenario: Room that existed before the upgrade
- **GIVEN** a room created by a previous version of Meet
- **WHEN** `roomGetConfig` is called for it after the upgrade
- **THEN** it returns `chat.persist` `false`, and its meetings store no chat message

### Requirement: What a participant who joins sees
In a meeting of a room that saves its chat, a participant holding `chatRead` who joins, reloads, reconnects or is granted it during the meeting SHALL find in the chat panel, before newer messages, the current meeting's messages, each once; never earlier meetings'. Loaded messages, and those received while the connection was lost until the history reloads, are not new messages (`New-message notice`): they SHALL NOT raise a notice, play a sound or add to the unread count.

#### Scenario: Late joiner
- **GIVEN** a meeting of a room that saves its chat where `alice` sent `hello` and `bob` sent `hi alice`
- **WHEN** `carol`, holding `chatRead`, joins the meeting and opens the chat panel
- **THEN** the panel shows `hello` labelled `alice` followed by `hi alice` labelled `bob`

#### Scenario: Earlier meeting
- **GIVEN** a room that saves its chat whose previous meeting exchanged `hello` and ended
- **WHEN** a participant joins the next meeting and opens the chat panel
- **THEN** the panel does not show `hello`, which stays stored in the room's history

#### Scenario: Reload during the meeting
- **GIVEN** a participant in a meeting of a room that saves its chat that exchanged `hello`
- **WHEN** they reload the page and enter the meeting again
- **THEN** their chat panel shows `hello`

#### Scenario: Connection lost for a while
- **GIVEN** a participant in a meeting of a room that saves its chat
- **WHEN** their connection drops, `alice` sends `missed you` meanwhile, and their connection comes back
- **THEN** their chat panel shows `missed you`, once, with no notice and no unread count for it

#### Scenario: chatRead granted during the meeting
- **GIVEN** a participant without `chatRead` in a meeting of a room that saves its chat where `hello` was sent
- **WHEN** a room manager updates the member with `chatRead` true
- **THEN** the chat button appears and the chat panel shows `hello`, once

#### Scenario: Promoted to a role with chatRead
- **GIVEN** a speaker without `chatRead` in a meeting of a room that saves its chat where `hello` was sent, and a moderator role holding `chatRead`
- **WHEN** a moderator promotes them
- **THEN** the chat button appears and the chat panel shows `hello`, once

#### Scenario: Joining a meeting with history
- **GIVEN** a meeting of a room that saves its chat where messages were exchanged
- **WHEN** a participant joins it with the chat panel closed
- **THEN** no notice is shown, no sound plays and the chat button shows no unread count

### Requirement: History is loaded 20 messages at a time
The chat panel SHALL show the last 20 messages of the history on joining and load earlier ones, 20 at a time, as the participant scrolls up, in the order the server stored them, which keeps the order each sender sent theirs in. When the history cannot be loaded, the panel SHALL show the live messages and no error.

#### Scenario: Earlier messages on scrolling up
- **GIVEN** a meeting of a room that saves its chat where 30 messages were sent, `message-1` to `message-30`
- **WHEN** a participant joins and opens the chat panel
- **THEN** the panel shows `message-11` to `message-30`
- **AND** scrolling to the top adds `message-1` to `message-10` above them, in order, and the list stays where the participant scrolled

#### Scenario: History unavailable
- **GIVEN** a meeting of a room that saves its chat whose server cannot read its history
- **WHEN** a participant joins and another participant then sends `hello`
- **THEN** the chat panel shows `hello` and no error

### Requirement: Senders and their labels
The server SHALL store each message with the sender the media server reports, whatever the client claims, with that sender's display name and participant type (`user`, `identified_guest` or `anonymous`). A participant SHALL see their own saved messages as their own: a user or identified guest always, an anonymous participant in the same browser. Other participants SHALL see an anonymous sender's messages labelled "Anonymous" next to the name in every room, saved or live.

#### Scenario: Anonymous participant reloads
- **GIVEN** an anonymous participant who sent `hello` in a meeting of a room that saves its chat
- **WHEN** they reload the page and enter the same meeting again in the same browser
- **THEN** their chat panel shows `hello` labelled as their own

#### Scenario: Anonymous participant joins again from another browser
- **GIVEN** an anonymous participant `dave` who sent `hello` in a meeting of a room that saves its chat
- **WHEN** they enter the same meeting again through the room link from another browser
- **THEN** their chat panel shows `hello` labelled `dave` and "Anonymous", as a message of another participant

#### Scenario: Anonymous sender
- **GIVEN** an anonymous participant `sara` in a meeting of a room that does not save its chat
- **WHEN** she sends `hi`
- **THEN** the other participants see `hi` labelled `sara` and "Anonymous"

#### Scenario: Client claims another sender
- **GIVEN** a participant `mallory` in a meeting of a room that saves its chat
- **WHEN** a modified client of hers sends a message claiming it was sent by `alice`
- **THEN** the history holds the message with `mallory` as its sender

### Requirement: Unconfirmed messages are sent again
A sent message SHALL reach the others without waiting to be stored, and a failed store SHALL be shown to no one. The server SHALL confirm each stored message to its sender, whose client SHALL send again, in order, each message unconfirmed after 5 seconds, until it is confirmed or the sender leaves, reloads the page or loses `chatWrite` or `chatRead`. A message sent again SHALL be stored and shown once; one still unconfirmed then SHALL be missing from the history.

#### Scenario: Message delivered while storage is down
- **GIVEN** a meeting of a room that saves its chat whose server cannot store messages
- **WHEN** a participant sends `hello`
- **THEN** the other participants see `hello` at once, and the sender sees no error

#### Scenario: Storage down for a while
- **GIVEN** a meeting of a room that saves its chat whose server cannot store messages for a minute
- **WHEN** a participant sends `still here` during that minute and stays in the meeting
- **THEN** the other participants see `still here` at once, and once
- **AND** a participant who joins after storage is back sees `still here` in the history, once

#### Scenario: Sender leaves before the confirmation
- **GIVEN** a meeting of a room that saves its chat whose server cannot store messages
- **WHEN** a participant sends `bye` and leaves the meeting before storage is back
- **THEN** the participants in the meeting saw `bye`, and a participant who joins later does not see it

### Requirement: Saving is invisible in the meeting
What the server does to save a meeting's chat SHALL NOT show as a participant: it SHALL NOT appear in the participants panel or in `participantList`, count in `participantCount`, towards `maxParticipants` or as someone connected when `recordingStart` or `broadcastStart` checks the meeting has participants, emit `participantJoined` or `participantLeft` as a webhook or embedded event, or keep the meeting going once every participant has left.

#### Scenario: Participants of a meeting that saves its chat
- **GIVEN** a meeting of a room that saves its chat with two participants
- **WHEN** an integrator calls `participantList` and `meetingGet`
- **THEN** both list two participants
- **AND** no `participantJoined` webhook or embedded event is emitted beyond those two participants

#### Scenario: Recording with only the saver left
- **GIVEN** a meeting of a room that saves its chat, with recording allowed and a live broadcast destination saved, whose participants have all left, before it ends
- **WHEN** an integrator calls `recordingStart` or `broadcastStart`
- **THEN** the server answers `409`

#### Scenario: Last free place
- **GIVEN** a room that saves its chat with `maxParticipants` 2 and one participant in its meeting
- **WHEN** a second participant joins
- **THEN** they are admitted

#### Scenario: Meeting ends as before
- **GIVEN** a meeting of a room that saves its chat
- **WHEN** its last participant leaves
- **THEN** the meeting ends after the same wait as in a room that does not save, and `meetingEnded` is emitted once
- **AND** no `participantLeft` webhook is sent for anyone but the participants who were in it

### Requirement: Saving with several replicas
With several Meet replicas, each message of a meeting SHALL be stored once, whichever replicas handle the meeting. When the replica saving a meeting's chat stops, another replica SHALL take over while the meeting goes on, and the messages sent meanwhile SHALL be stored once their senders send them again.

#### Scenario: Two replicas, one meeting
- **GIVEN** two Meet replicas and a meeting of a room that saves its chat whose events reach both
- **WHEN** a participant sends `hello`
- **THEN** the room's history holds `hello` once

#### Scenario: The saving replica stops
- **GIVEN** two Meet replicas and a meeting of a room that saves its chat, saved through replica A
- **WHEN** replica A stops and a participant who stays in the meeting sends `are you there`
- **THEN** once its sender's client has sent it again to the replica that took over, a participant who joins sees `are you there` in the history, once

#### Scenario: Replicas with different clocks
- **GIVEN** two Meet replicas whose clocks differ by a minute and a meeting of a room that saves its chat whose saver moves from one to the other
- **WHEN** a participant sends `one` before the move and `two` after it
- **THEN** the history holds `one` before `two`

#### Scenario: The only server restarts
- **GIVEN** one Meet server and a meeting of a room that saves its chat
- **WHEN** the server restarts and a participant who stays in the meeting sends `back`
- **THEN** once its sender's client has sent it again to the restarted server, a participant who joins sees `back` in the history, once

### Requirement: Reading the history needs chatRead
The server SHALL serve a room's history only to a participant in its meeting (a join token of the room with `chatRead` whose identity is in the meeting) while the room saves its chat; other valid tokens SHALL get `403`, revoked ones such as a kicked participant's `401` (`meeting-moderation`). `maxItems` (20 by default, at most 100) and `nextPageToken` SHALL follow `roomList` (`422`, `400`), and the server SHALL answer `503` when the media server refuses the connection.

#### Scenario: Without chatRead
- **GIVEN** an identified guest with `chatRead` false in a meeting of a room that saves its chat
- **WHEN** their client asks the server for the history
- **THEN** the server answers `403`

#### Scenario: Token of another room
- **GIVEN** a room member token of room `B`
- **WHEN** its holder asks the server for the history of room `A`
- **THEN** the server answers `403`

#### Scenario: Token that does not join
- **GIVEN** a room member token of the room issued without `joinMeeting`, holding `chatRead`
- **WHEN** its holder asks the server for the history
- **THEN** the server answers `403`

#### Scenario: Participant no longer in the meeting
- **GIVEN** a participant who left the meeting of a room that saves its chat, holding the join token they joined with
- **WHEN** they ask the server for the history with that token
- **THEN** the server answers `403`

#### Scenario: Kicked participant
- **GIVEN** a participant kicked from the meeting of a room that saves its chat
- **WHEN** they ask the server for the history with the token they held
- **THEN** the server answers `401`

#### Scenario: Without a room member token
- **WHEN** a client without a room member token asks the server for the history of a room
- **THEN** the server answers `401`

#### Scenario: Invalid page size
- **GIVEN** a participant holding `chatRead` in a meeting of a room that saves its chat
- **WHEN** their client asks the server for the history with `maxItems` 0
- **THEN** the server answers `422`

#### Scenario: Room that does not save its chat
- **GIVEN** a participant holding `chatRead` in a meeting of a room with `config.chat.persist` false
- **WHEN** their client asks the server for the history
- **THEN** the server answers with no messages

### Requirement: Saved messages are deleted only with their room
A room's stored messages SHALL stay after each of its meetings ends and SHALL be deleted together with the room, however it is deleted: `roomDelete`, `roomBulkDelete`, a deletion that waited for the meeting to end, or auto-deletion. Turning saving or chat off, turning encryption on, removing a member or deleting a user SHALL NOT delete or change them; while the room does not save its chat, the server SHALL serve none of them.

#### Scenario: Room deleted
- **GIVEN** a room that saves its chat whose meetings exchanged messages
- **WHEN** the room is deleted with `roomDelete`
- **THEN** no chat message of that room remains stored

#### Scenario: Room deleted when its meeting ends
- **GIVEN** a room deleted while its meeting was in progress, so the deletion waits for the meeting to end
- **WHEN** the meeting ends
- **THEN** the room and every chat message of it are deleted

#### Scenario: Member removed during the meeting
- **GIVEN** an identified guest `diego` who sent `see you` in a meeting of a room that saves its chat
- **WHEN** a room manager removes `diego` from the room and a participant then joins the meeting
- **THEN** the participant's chat panel shows `see you` labelled `diego`

#### Scenario: Settings changed after a meeting
- **GIVEN** a room that saves its chat whose meeting stored `hello`, sent by the user `ana`, and ended
- **WHEN** its owner turns saving off and encryption on, and an administrator deletes `ana`
- **THEN** `hello` stays stored with `ana` as its sender

### Requirement: Chat saving toggle in the room wizard
While chat is on, the console room wizard's Meeting step SHALL show a "Save the room's chat" toggle bound to `config.chat.persist`. While end-to-end encryption is on, the toggle SHALL be disabled and off and the restrictions the wizard lists for encryption SHALL say that chat messages are not saved; turning encryption off again, from any step of the wizard, SHALL restore the value the toggle had.

#### Scenario: Chat turned off hides the saving toggle
- **GIVEN** a room manager creating a room in the wizard
- **WHEN** they turn chat off in the Meeting step
- **THEN** the saving toggle is not shown

#### Scenario: Defaults of a new room
- **GIVEN** a room manager on the Meeting step of the wizard for a new room
- **WHEN** they read the chat options
- **THEN** "Save the room's chat" is on

#### Scenario: Encryption turned on
- **GIVEN** a wizard with "Save the room's chat" on
- **WHEN** the room manager turns end-to-end encryption on
- **THEN** the saving toggle is disabled and off
- **AND** the listed restrictions say that chat messages are not saved

#### Scenario: Encryption turned on and off again
- **GIVEN** a wizard with "Save the room's chat" on
- **WHEN** the room manager turns end-to-end encryption on and later off again
- **THEN** the saving toggle is enabled and on again

#### Scenario: Encryption turned off by allowing recording
- **GIVEN** a wizard with "Save the room's chat" on and end-to-end encryption then turned on
- **WHEN** the room manager allows recording in the Recording step
- **THEN** encryption is off and "Save the room's chat" is enabled and on again

#### Scenario: Encryption back on when recording is disallowed again
- **GIVEN** a wizard with "Save the room's chat" on, end-to-end encryption turned on and then recording allowed
- **WHEN** the room manager disallows recording again
- **THEN** encryption is on and "Save the room's chat" is disabled and off

#### Scenario: Editing a room keeps its setting
- **GIVEN** a room with `config.chat.persist` false
- **WHEN** its owner opens it in the wizard
- **THEN** "Save the room's chat" is off

## MODIFIED Requirements

### Requirement: Delivery and display
A sent message SHALL reach, through the media server, only the participants of the meeting who hold `chatRead` when it is sent, and the server in a room that saves its chat (`Saving the room's chat`), in the order it was sent, so a participant without `chatRead` does not receive it even with a client that bypasses the interface. It SHALL be shown labelled with the sender's display name; the sender sees it labelled as their own. Addresses in a message SHALL be shown as links.

#### Scenario: Receiving a message
- **GIVEN** two participants in a meeting, `sender` and `receiver`
- **WHEN** `sender` sends `hello from sender`
- **THEN** `receiver` sees that message labelled `sender`
- **AND** `sender` sees it labelled as their own

#### Scenario: Several messages in a row
- **GIVEN** a participant in a meeting
- **WHEN** they send `message-1`, `message-2` and `message-3` quickly
- **THEN** every participant sees them in that order

#### Scenario: Link in a message
- **GIVEN** a participant in a meeting
- **WHEN** they send `demos.openvidu.io`
- **THEN** the message shows it as a link

#### Scenario: Participant without chatRead
- **GIVEN** a meeting with a participant whose permissions deny `chatRead`, connected with a client that bypasses the interface
- **WHEN** another participant sends a message
- **THEN** the media server does not deliver the message to that participant

#### Scenario: chatRead granted during the meeting
- **GIVEN** a participant in a meeting of a room that does not save its chat, whose `chatRead` was just granted
- **WHEN** another participant sends a message afterwards
- **THEN** the participant receives and sees it, and does not see the messages sent before the grant

### Requirement: Messages last only the meeting
In a room that does not save its chat (`config.chat.persist` false, chat disabled or end-to-end encryption enabled), chat messages SHALL exist only among the participants of the meeting: a participant who joins later SHALL NOT see earlier messages, and the next meeting a participant enters SHALL start with an empty chat. Whatever the room, chat messages SHALL be exposed through no public REST operation, webhook or embedded event.

#### Scenario: Late joiner
- **GIVEN** a meeting of a room that does not save its chat where messages were exchanged
- **WHEN** a new participant joins and opens the chat panel
- **THEN** the panel shows no earlier messages

#### Scenario: Next meeting in the same tab
- **GIVEN** a participant who exchanged messages in a meeting of a room that does not save its chat and left it
- **WHEN** they enter a meeting again in the same tab or embedded element
- **THEN** the chat panel is empty and the chat button shows no unread count

#### Scenario: Another room in the same tab
- **GIVEN** a participant who exchanged messages in a meeting of room `A`, which saves its chat, and left it
- **WHEN** they enter a meeting of room `B` in the same tab or embedded element
- **THEN** the chat panel shows none of room `A`'s messages and the chat button shows no unread count

### Requirement: Chat in encrypted meetings
In a room with end-to-end encryption enabled, chat messages SHALL be encrypted with the meeting's encryption key: a participant whose key differs SHALL NOT receive the messages of the others, and their chat panel SHALL warn that participants with a different key are connected. The server SHALL store none of the meeting's messages and the chat panel SHALL say that messages are not saved. Encryption itself is defined in `meeting-media`.

#### Scenario: Same key
- **GIVEN** two participants of an encrypted room joined with the same key
- **WHEN** one sends a message
- **THEN** the other sees it in clear

#### Scenario: Different key
- **GIVEN** two participants with one key and a third with another
- **WHEN** one of the first two sends a message
- **THEN** the third participant's chat shows no message and warns about participants with a different key

#### Scenario: Late joiner in an encrypted room
- **GIVEN** an encrypted room whose participants exchanged messages
- **WHEN** a new participant joins with the same key and opens the chat panel
- **THEN** the panel shows no earlier messages and says that messages are not saved
