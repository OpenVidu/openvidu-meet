## MODIFIED Requirements

### Requirement: Join tokens
With `joinMeeting` set to `true`, the server SHALL issue a token that connects its holder to the room's meeting with the media grant of its permissions (see `permissions`) once the join checks pass: an open room, `meetingJoin`, a known name and room below `maxParticipants`, with the refusals specified in `meeting-join`. The name SHALL be the member's or the user's, else the `participantName` given, which an encrypted room always uses. The identity is specified in `meetings`.

#### Scenario: Name taken from the member
- **GIVEN** an identified guest named "Alice Smith"
- **WHEN** a join token is requested with their personal link and no `participantName`
- **THEN** the token joins the meeting as "Alice Smith"

#### Scenario: Name taken from the account
- **GIVEN** a registered user who is a member of the room
- **WHEN** they request a join token with their access token and no `participantName`
- **THEN** the token joins the meeting under the name of their member record

#### Scenario: Another name asked for an identified guest
- **GIVEN** an identified guest named "Alice Smith" in a room without end-to-end encryption
- **WHEN** a join token is requested with their personal link and `participantName` "Bob"
- **THEN** the token joins the meeting as "Alice Smith"

#### Scenario: Another name asked by a signed-in user
- **GIVEN** a signed-in user named "Carol", not a member of a room without end-to-end encryption
- **WHEN** they request a join token with the room's anonymous speaker secret and `participantName` "Dave"
- **THEN** the token joins the meeting as "Carol"

#### Scenario: Anonymous participant
- **GIVEN** a request with the room's anonymous moderator secret and no access token
- **WHEN** a join token is requested with `participantName` "Erin"
- **THEN** the token joins the meeting as "Erin"

#### Scenario: Encrypted room
- **GIVEN** an identified guest of a room with `e2ee.enabled` `true`
- **WHEN** a join token is requested with their personal link and the encrypted name as `participantName`
- **THEN** the token joins the meeting under that encrypted name

#### Scenario: Join checks
- **GIVEN** a room member token request with `joinMeeting` for a closed room, or with the room's anonymous recording secret
- **WHEN** the server handles it
- **THEN** it answers `409` for the closed room and `403` for the recording secret, as `meeting-join` specifies
