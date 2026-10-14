## MODIFIED Requirements

### Requirement: Leave reasons
The `reason` of `meetingLeft` SHALL be one of the leave reasons of `meetings`, `voluntary_leave` also when the participant closes the page, except that an end of the meeting for everyone SHALL be `meeting_ended_by_self` when the local participant ended it, `meeting_ended_by_duration_limit` when it reached `maxDurationMinutes`, and `meeting_ended` whoever or whatever else ended it (another participant, the REST API, the room's deletion).

#### Scenario: Ended by a moderator
- **GIVEN** two participants in a meeting, each in an embedded element
- **WHEN** one of them ends the meeting for everyone from the leave menu
- **THEN** the other receives `meetingLeft` with `reason` `meeting_ended`
- **AND** the one who ended it receives `meeting_ended_by_self`

#### Scenario: Ended with the meetingEnd command
- **GIVEN** two participants in a meeting, each in an embedded element, the first holding `meetingEnd`
- **WHEN** the first element's host calls `meetingEnd()`, or the deprecated `endMeeting()`
- **THEN** the first element emits `meetingLeft` with `reason` `meeting_ended_by_self`
- **AND** the second receives `meeting_ended`

#### Scenario: Kicked
- **GIVEN** a participant in a meeting
- **WHEN** a moderator removes them
- **THEN** they receive `meetingLeft` with `reason` `participant_kicked`

#### Scenario: Duration limit
- **GIVEN** a meeting whose room has `config.maxDurationMinutes` set
- **WHEN** the meeting reaches it
- **THEN** each participant receives `meetingLeft` with `reason` `meeting_ended_by_duration_limit`

#### Scenario: Same identity elsewhere
- **GIVEN** an identified guest in a meeting inside an embedded element
- **WHEN** they join the same meeting from another tab
- **THEN** the element emits `meetingLeft` with `reason` `duplicate_identity`
