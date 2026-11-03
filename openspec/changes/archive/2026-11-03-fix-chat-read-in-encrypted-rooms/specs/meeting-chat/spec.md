## ADDED Requirements

### Requirement: chatRead holds in encrypted meetings
In a room with end-to-end encryption enabled, a sent message SHALL reach, through the media server, only the participants of the meeting who hold `chatRead` when it is sent, exactly as in a room without encryption. A participant without `chatRead` SHALL receive nothing even though they hold the meeting's key.

#### Scenario: Participant without chatRead in an encrypted room
- **GIVEN** an encrypted room whose speaker role denies `chatRead`, with a moderator and a speaker in the meeting
- **WHEN** the moderator sends a message
- **THEN** the speaker's client receives no message

#### Scenario: Participant with chatRead in an encrypted room
- **GIVEN** an encrypted room with two participants holding `chatRead` and the same key
- **WHEN** one sends a message
- **THEN** the other sees it in clear
