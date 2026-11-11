## MODIFIED Requirements

### Requirement: A meeting starts when a participant commits to join
A room SHALL hold at most one meeting at a time. Meet SHALL start the meeting when a participant of a room without a running meeting obtains a join token, which the meeting UI does when the participant presses Join on the device setup screen (see `meeting-join`) or, behind a waiting room, is let in (see `waiting-room`). Opening the access link or staying on the join or device setup screen SHALL NOT start it. While the meeting runs, the room status SHALL be `active_meeting` (see `rooms`).

#### Scenario: Choosing devices does not start the meeting
- **GIVEN** an open room with no meeting running
- **WHEN** a participant opens its access link and stays on the device setup screen
- **THEN** the room status stays `open`
- **AND** no `meetingStarted` webhook is sent

#### Scenario: Pressing Join starts the meeting
- **GIVEN** an open room with no meeting running
- **WHEN** a participant presses the join button of the device setup screen
- **THEN** the room status becomes `active_meeting`

#### Scenario: Later participants join the running meeting
- **GIVEN** a room whose meeting is running
- **WHEN** another participant presses Join
- **THEN** they enter the same meeting and no new meeting starts
