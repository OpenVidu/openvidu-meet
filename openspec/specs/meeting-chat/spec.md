# Meeting Chat Specification

## Purpose

Text chat between the participants of a meeting: who can read it, who can write in it, how messages are
delivered and shown, and how a room turns it off. Participants and the room managers who decide what each
role may do rely on it.

Surfaces: the meeting's chat panel and its toolbar button, the room config field `chat.enabled`
(`createRoom`, `updateRoomConfig`, `getRoomConfig`; `meet-ce/backend/openapi/rooms/`) and its toggle in the
console room wizard, and the permissions `chatRead` and `chatWrite` (deprecated `canReadChat` and
`canWriteChat` until 3.12.0, see `permissions`). Chat has no REST operation, webhook or embedded command or
event of its own. Documented in openvidu.io `docs/meet/features/meetings/configuration.md`,
`docs/meet/features/rooms/access.md` and `docs/meet/features/meetings/e2e-encryption.md`.

## Requirements

### Requirement: Room chat switch
A room's `config.chat.enabled` SHALL turn the chat on or off for every participant of its meetings, whatever their permissions, and SHALL default to `true` when a room is created without it. When it can be changed is defined in `room-config`.

#### Scenario: Room created without chat config
- **GIVEN** a room created through `createRoom` without `config.chat`
- **WHEN** its config is read with `getRoomConfig`
- **THEN** `chat.enabled` is `true`

#### Scenario: Chat disabled
- **GIVEN** a room with `config.chat.enabled` false
- **WHEN** a moderator holding `chatRead` and `chatWrite` joins its meeting
- **THEN** the toolbar shows no chat button and no chat panel can be opened

### Requirement: Reading the chat needs chatRead
In a room whose chat is enabled, the meeting SHALL show the chat button and the chat panel only to participants holding `chatRead`, and SHALL NOT show messages, new-message notices or unread counts to anyone else, `chatWrite` notwithstanding.

#### Scenario: Participant with chatRead
- **GIVEN** a room with chat enabled and an identified guest holding `chatRead`
- **WHEN** they join the meeting
- **THEN** the toolbar shows the chat button

#### Scenario: Participant without chatRead
- **GIVEN** a room with chat enabled and an identified guest with `chatRead` false and `chatWrite` true
- **WHEN** they join the meeting and another participant sends a message
- **THEN** they see no chat button, no chat panel and no notice of the message

### Requirement: Read-only chat without chatWrite
A participant holding `chatRead` but not `chatWrite` SHALL see the chat read-only: the messages are shown and, in place of the message input, a notice says they cannot send messages.

#### Scenario: Read-only participant opens the chat
- **GIVEN** an identified guest with `chatRead` true and `chatWrite` false
- **WHEN** they open the chat panel
- **THEN** the panel shows the messages and the read-only notice, and no input or send button

### Requirement: Server enforcement of chatWrite
The server SHALL let a participant publish chat messages to the media server only when they hold `chatWrite` and the room's `config.chat.enabled` is `true`, so a client that bypasses the interface cannot send messages without them; receiving is not affected. A promotion, a demotion or a permission change during the meeting SHALL keep this rule.

#### Scenario: Join token without chatWrite
- **GIVEN** an identified guest with `chatWrite` false
- **WHEN** they join the meeting
- **THEN** their media server grant does not allow publishing data, and a message they try to send directly is rejected by the media server

#### Scenario: Join token with chatWrite
- **GIVEN** an identified guest with `chatWrite` true
- **WHEN** they join the meeting
- **THEN** their media server grant allows publishing data

#### Scenario: Chat disabled in the room
- **GIVEN** a room with `config.chat.enabled` false
- **WHEN** a moderator holding `chatWrite` joins its meeting and a modified client sends a chat message
- **THEN** their media server grant does not allow publishing data and no participant receives the message

#### Scenario: Promotion in a room without chat
- **GIVEN** a room with `config.chat.enabled` false and a speaker in its meeting
- **WHEN** a moderator promotes the speaker
- **THEN** the promoted participant's media server grant still does not allow publishing data

### Requirement: Permission changes apply during the meeting
When a participant's `chatRead` or `chatWrite` changes during the meeting, through a room member update or a promotion to moderator or demotion, the chat SHALL follow without rejoining: the chat button and panel appear or disappear, the input switches to or from read-only, and the media server grant follows `chatWrite`.

#### Scenario: chatWrite revoked
- **GIVEN** an identified guest with the chat panel open and `chatWrite` true
- **WHEN** a room manager updates the member with `chatWrite` false
- **THEN** the panel turns read-only and the media server rejects further messages from them

#### Scenario: chatRead granted
- **GIVEN** an identified guest in the meeting with `chatRead` false
- **WHEN** a room manager updates the member with `chatRead` true
- **THEN** the chat button appears without the participant leaving the meeting

#### Scenario: Promotion grants writing
- **GIVEN** a speaker without `chatWrite` in a room whose moderator role holds `chatWrite`
- **WHEN** a moderator promotes them
- **THEN** they can send messages from the chat panel

### Requirement: Sending messages
A participant who can write SHALL send a message with the send button or the Enter key. A message SHALL be at most 500 characters, consecutive spaces SHALL collapse into one, and a message that is empty or only a space SHALL NOT be sent.

#### Scenario: Enter sends
- **GIVEN** a participant typing `hello` in the chat input
- **WHEN** they press Enter
- **THEN** the message is sent and the input is cleared

#### Scenario: Blank message
- **GIVEN** a participant whose chat input holds only a space
- **WHEN** they press send
- **THEN** no message is sent

#### Scenario: Length limit
- **GIVEN** a participant typing in the chat input
- **WHEN** they reach 500 characters
- **THEN** the input accepts no more characters

### Requirement: Delivery and display
A sent message SHALL reach, through the media server, only the participants of the meeting who hold `chatRead` when it is sent, in the order it was sent, so a participant without `chatRead` does not receive it even with a client that bypasses the interface. It SHALL be shown labelled with the sender's display name; the sender sees it labelled as their own. Addresses in a message SHALL be shown as links.

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
- **GIVEN** a participant in the meeting whose `chatRead` was just granted
- **WHEN** another participant sends a message afterwards
- **THEN** the participant receives and sees it, and does not receive the messages sent before the grant

### Requirement: Messages last only the meeting
Chat messages SHALL exist only among the participants of the meeting: the server SHALL keep no history and expose messages through no REST operation, webhook or embedded event, a participant who joins later SHALL NOT see earlier messages, and the next meeting a participant enters SHALL start with an empty chat.

#### Scenario: Late joiner
- **GIVEN** a meeting where messages were exchanged
- **WHEN** a new participant joins and opens the chat panel
- **THEN** the panel shows no earlier messages

#### Scenario: Next meeting in the same tab
- **GIVEN** a participant who exchanged messages in a meeting and left it
- **WHEN** they enter a meeting again in the same tab or embedded element
- **THEN** the chat panel is empty and the chat button shows no unread count

### Requirement: New-message notice
While the chat panel is closed, a message from another participant SHALL raise a notice naming the sender with an action that opens the chat, play a sound and add to the unread count on the chat button. A newer message SHALL replace the notice on screen, and opening the panel SHALL clear the unread count.

#### Scenario: Message with the panel closed
- **GIVEN** a participant with the chat panel closed
- **WHEN** another participant sends a message
- **THEN** a notice names the sender and offers to open the chat
- **AND** using it opens the chat panel showing the message

#### Scenario: No messages yet
- **GIVEN** a participant who has just joined a meeting without messages
- **WHEN** the meeting is shown
- **THEN** the chat button shows no unread count

### Requirement: Open chat follows the conversation
With the chat panel open, a new message SHALL scroll the message list to the newest message, even when the participant had scrolled up.

#### Scenario: Scrolled up when a message arrives
- **GIVEN** a participant with the chat panel open, scrolled to the oldest of many messages
- **WHEN** a new message arrives
- **THEN** the list scrolls to show the newest message

### Requirement: Typing in the chat does not trigger shortcuts
Keys typed in the chat input SHALL go to the message and SHALL NOT trigger the meeting's keyboard shortcuts.

#### Scenario: Typing letters bound to shortcuts
- **GIVEN** a participant with the chat panel open
- **WHEN** they type `hello there 1` in the chat input
- **THEN** the input holds `hello there 1`
- **AND** the `R` and `E` keys neither raised their hand nor opened the reaction picker

### Requirement: Chat in encrypted meetings
In a room with end-to-end encryption enabled, chat messages SHALL be encrypted with the meeting's encryption key: a participant whose key differs SHALL NOT receive the messages of the others, and their chat panel SHALL warn that participants with a different key are connected. Encryption itself is defined in `meeting-media`.

#### Scenario: Same key
- **GIVEN** two participants of an encrypted room joined with the same key
- **WHEN** one sends a message
- **THEN** the other sees it in clear

#### Scenario: Different key
- **GIVEN** two participants with one key and a third with another
- **WHEN** one of the first two sends a message
- **THEN** the third participant's chat shows no message and warns about participants with a different key

### Requirement: Chat in the room wizard
The console room wizard SHALL offer the chat toggle in its Meeting step and, while chat is off, show the `chatRead` and `chatWrite` permissions of the moderator and speaker roles disabled, keeping their values for when chat is turned back on.

#### Scenario: Turning chat off in the wizard
- **GIVEN** a room manager creating a room in the wizard
- **WHEN** they turn chat off in the Meeting step and open the role permissions
- **THEN** the `chatRead` and `chatWrite` toggles of both roles are disabled

#### Scenario: Turning chat back on
- **GIVEN** a wizard where the speaker's `chatWrite` was off before chat was turned off
- **WHEN** the room manager turns chat back on
- **THEN** the speaker's `chatWrite` is still off and can be changed again
