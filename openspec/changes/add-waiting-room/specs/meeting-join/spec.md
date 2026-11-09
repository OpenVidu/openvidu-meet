## MODIFIED Requirements

### Requirement: Server checks when joining
When a participant joins, the server SHALL issue their join token only if:
- the room is open (`409` otherwise);
- they hold `meetingJoin` (`403`);
- a name is given or known from their member record or user account (`400`);
- the meeting is below its `maxParticipants` (`409`, see `meetings`), counting in a room with the waiting room on the participants admitted who have not joined yet;
- in a room with the waiting room on, they hold `lobbyBypass` or were admitted to the running meeting. Otherwise they get a waiting credential and wait (see `waiting-room`).

The meeting SHALL then show the "Closed room", "Forbidden room access" or "Meeting full" error screen.

#### Scenario: Room closed while choosing devices
- **GIVEN** a participant on the device setup screen
- **WHEN** a room manager closes the room and the participant presses join
- **THEN** the server answers `409` and the "Closed room" error screen is shown

#### Scenario: Full meeting
- **GIVEN** a room with `config.maxParticipants` 2 and a meeting with 2 participants
- **WHEN** a third participant presses join
- **THEN** the server answers `409` and the "Meeting full" error screen is shown

#### Scenario: Recording secret cannot join
- **GIVEN** the anonymous recording secret of a room
- **WHEN** a join token is requested with it, `joinMeeting` true and a participant name
- **THEN** the server answers `403`

#### Scenario: No name for an anonymous join
- **GIVEN** an anonymous moderator secret
- **WHEN** a join token is requested with `joinMeeting` true and no `participantName`
- **THEN** the server answers `400`

#### Scenario: Waiting room on
- **GIVEN** a room with the waiting room on and a speaker without `lobbyBypass`
- **WHEN** a join token is requested for the speaker
- **THEN** the server answers with a waiting credential instead of a join token

### Requirement: Leaving the meeting
Every participant SHALL be able to leave the meeting from the toolbar; a participant holding `meetingEnd` SHALL get a choice between leaving and ending the meeting for everyone (ending is defined in `meetings`). The embedded command `meetingLeave`, and its deprecated alias `leaveRoom` until 3.12.0, SHALL leave like the toolbar and need no permission. Before the participant has joined it SHALL do nothing, except while they wait to be admitted, when it SHALL leave the waiting room (see `waiting-room`).

#### Scenario: Participant without meetingEnd
- **GIVEN** a speaker without `meetingEnd` in a meeting
- **WHEN** they press the leave button
- **THEN** they leave the meeting at once and the end screen is shown

#### Scenario: Participant with meetingEnd
- **GIVEN** a moderator holding `meetingEnd`
- **WHEN** they press the leave button
- **THEN** a menu offers to leave or to end the meeting for everyone

#### Scenario: Leave command before joining
- **GIVEN** an embedded element on the device setup screen
- **WHEN** the host calls `meetingLeave()`
- **THEN** nothing happens and the device setup screen stays

#### Scenario: Leave command while waiting
- **GIVEN** an embedded element whose participant waits to be admitted
- **WHEN** the host calls `meetingLeave()`
- **THEN** the participant leaves the waiting room
