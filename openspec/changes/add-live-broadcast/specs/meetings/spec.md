## MODIFIED Requirements

### Requirement: Read a live meeting
`GET /api/v1/meetings/{roomId}` (`meetingGet`) SHALL return the live state of the room's meeting (start, deadline, participant count, whether a recording is in progress, whether a live broadcast is in progress, participant cap; see the OpenAPI) and SHALL answer 404 when the room does not exist or has no meeting running. It SHALL accept an API key or a room member token for that room holding `meetingRead`; holding `meetingJoin` alone SHALL NOT be enough.

#### Scenario: Meeting running
- **GIVEN** a running meeting with one participant
- **WHEN** a client holding `meetingRead` calls `meetingGet`
- **THEN** the request answers 200 with `participantCount` 1

#### Scenario: Meeting being broadcast
- **GIVEN** a running meeting streaming to one destination
- **WHEN** a client holding `meetingRead` calls `meetingGet`
- **THEN** the request answers 200 with `broadcastActive` `true`
- **AND** once that broadcast has ended, `meetingGet` answers `broadcastActive` `false`

#### Scenario: No meeting
- **GIVEN** an existing room without a meeting
- **WHEN** a client holding `meetingRead` calls `meetingGet`
- **THEN** the request answers 404 stating the room has no active meeting

#### Scenario: Token without meetingRead
- **GIVEN** a room member token for the room that holds `meetingJoin` but not `meetingRead`
- **WHEN** it calls `meetingGet`
- **THEN** the request answers 403

#### Scenario: Token for another room
- **GIVEN** a room member token minted for room B
- **WHEN** it calls `meetingGet` for room A
- **THEN** the request answers 403
