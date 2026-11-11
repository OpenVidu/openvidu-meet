## MODIFIED Requirements

### Requirement: Server checks when joining
The server SHALL issue a participant's join token only if:
- the room is open (`409` otherwise);
- they hold `meetingJoin` (`403`);
- a name is given or known from their member record or account (`400`);
- the meeting is below its `maxParticipants` (`409`, see `meetings`);
- with the waiting room on, they hold `waitingRoomBypass` or an admitted wait's ticket, or else they wait (see `waiting-room`).

The meeting SHALL show the "Closed room", "Forbidden room access" or "Meeting full" error screen.

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
- **GIVEN** a room with the waiting room on and a speaker without `waitingRoomBypass`
- **WHEN** a join token is requested for the speaker
- **THEN** the server answers with a waiting ticket instead of a join token

### Requirement: Joining happens from the device setup screen
Submitting the join screen SHALL open the device setup screen, where the participant prepares their camera and microphone (see `meeting-media`), and the participant SHALL join only when they press its join button: until then the meeting is not started (see `meetings`), no name is reserved and capacity is not checked. A participant who would wait asks to join from the join screen instead, and prepares their devices while waiting or joins at once if let in without waiting (see `waiting-room`).

#### Scenario: Choosing devices
- **GIVEN** an open room without a meeting
- **WHEN** a participant submits the join screen and stays on the device setup screen
- **THEN** the room status stays `open`

#### Scenario: Pressing join
- **GIVEN** a participant on the device setup screen of an open room without a meeting
- **WHEN** they press the join button
- **THEN** they enter the meeting and the room status becomes `active_meeting`

#### Scenario: Double press
- **GIVEN** a participant on the device setup screen
- **WHEN** they press the join button twice quickly
- **THEN** they join once, with a single name and identity

#### Scenario: Participant who would wait
- **GIVEN** a room with the waiting room on and a speaker without `waitingRoomBypass`
- **WHEN** the speaker submits the join screen
- **THEN** they wait without seeing the device setup screen

### Requirement: Leaving the meeting
Every participant SHALL be able to leave the meeting from the toolbar; a participant holding `meetingEnd` SHALL get a choice between leaving and ending the meeting for everyone (ending is defined in `meetings`). The embedded command `meetingLeave`, and its deprecated alias `leaveRoom` until 3.12.0, SHALL leave like the toolbar and need no permission. Before the participant has joined it SHALL do nothing, except leave the waiting room while they wait (see `waiting-room`).

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
