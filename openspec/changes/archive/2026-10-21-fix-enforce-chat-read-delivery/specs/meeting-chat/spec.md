## MODIFIED Requirements

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
