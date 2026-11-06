## MODIFIED Requirements

### Requirement: Server enforcement of chatWrite
The server SHALL let a participant publish chat messages to the media server only when they hold both `chatRead` and `chatWrite` and the room's `config.chat.enabled` is `true`, so a client that bypasses the interface cannot send messages without them, nor write into a chat it cannot read; receiving is not affected. A promotion, a demotion or a permission change during the meeting SHALL keep this rule.

#### Scenario: Join token without chatWrite
- **GIVEN** an identified guest with `chatWrite` false
- **WHEN** they join the meeting
- **THEN** their media server grant does not allow publishing data, and a message they try to send directly is rejected by the media server

#### Scenario: Join token with chatWrite
- **GIVEN** an identified guest with `chatRead` and `chatWrite` true
- **WHEN** they join the meeting
- **THEN** their media server grant allows publishing data

#### Scenario: Join token with chatWrite but without chatRead
- **GIVEN** an identified guest with `chatWrite` true and `chatRead` false
- **WHEN** they join the meeting and a modified client sends a chat message
- **THEN** their media server grant does not allow publishing data and no participant receives the message

#### Scenario: Chat disabled in the room
- **GIVEN** a room with `config.chat.enabled` false
- **WHEN** a moderator holding `chatWrite` joins its meeting and a modified client sends a chat message
- **THEN** their media server grant does not allow publishing data and no participant receives the message

#### Scenario: Promotion in a room without chat
- **GIVEN** a room with `config.chat.enabled` false and a speaker in its meeting
- **WHEN** a moderator promotes the speaker
- **THEN** the promoted participant's media server grant still does not allow publishing data

### Requirement: Permission changes apply during the meeting
When a participant's `chatRead` or `chatWrite` changes during the meeting, through a room member update or a promotion to moderator or demotion, the chat SHALL follow without rejoining: the chat button and panel appear or disappear, the input switches to or from read-only, and the media server grant follows `chatRead` and `chatWrite`.

#### Scenario: chatWrite revoked
- **GIVEN** an identified guest with the chat panel open and `chatWrite` true
- **WHEN** a room manager updates the member with `chatWrite` false
- **THEN** the panel turns read-only and the media server rejects further messages from them

#### Scenario: chatRead revoked
- **GIVEN** an identified guest in the meeting with `chatRead` and `chatWrite` true
- **WHEN** a room manager updates the member with `chatRead` false
- **THEN** the chat button disappears and the media server rejects further messages from them

#### Scenario: chatRead granted
- **GIVEN** an identified guest in the meeting with `chatRead` false
- **WHEN** a room manager updates the member with `chatRead` true
- **THEN** the chat button appears without the participant leaving the meeting

#### Scenario: Promotion grants writing
- **GIVEN** a speaker without `chatWrite` in a room whose moderator role holds `chatRead` and `chatWrite`
- **WHEN** a moderator promotes them
- **THEN** they can send messages from the chat panel

### Requirement: Chat in the room wizard
The console room wizard SHALL offer the chat toggle in its Meeting step and, while chat is off, show the `chatRead` and `chatWrite` permissions of the moderator and speaker roles disabled, keeping their values for when chat is turned back on. While chat is on, it SHALL show a role's `chatWrite` disabled while that role does not hold `chatRead`, keeping its value, since it has no effect without it.

#### Scenario: Turning chat off in the wizard
- **GIVEN** a room manager creating a room in the wizard
- **WHEN** they turn chat off in the Meeting step and open the role permissions
- **THEN** the `chatRead` and `chatWrite` toggles of both roles are disabled

#### Scenario: Turning chat back on
- **GIVEN** a wizard where the speaker's `chatWrite` was off before chat was turned off
- **WHEN** the room manager turns chat back on
- **THEN** the speaker's `chatWrite` is still off and can be changed again

#### Scenario: Reading revoked from a role
- **GIVEN** a wizard with chat on and the speaker role holding `chatRead` and `chatWrite`
- **WHEN** the room manager switches off the speaker's `chatRead`
- **THEN** the speaker's `chatWrite` toggle is disabled and still on
- **AND** switching `chatRead` back on makes it available again
