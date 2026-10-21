## MODIFIED Requirements

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
