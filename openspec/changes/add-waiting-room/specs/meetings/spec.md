## MODIFIED Requirements

### Requirement: Read a live meeting
`GET /api/v1/meetings/{roomId}` (`meetingGet`) SHALL return the live state of the room's meeting (start, deadline, participant count, whether a recording is in progress, whether a live broadcast is in progress, participant cap; see the OpenAPI) and SHALL answer 404 when the room does not exist or has no meeting running. It SHALL accept an API key or a room member token for that room holding `meetingRead`; holding `meetingJoin` alone SHALL NOT be enough. In a room with the waiting room on, the token SHALL also belong to someone admitted to the running meeting or holding `lobbyBypass` (see `waiting-room`).

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

#### Scenario: Room with the waiting room on
- **GIVEN** a room with the waiting room on and a meeting running
- **WHEN** a room member token holding `meetingRead`, whose holder was not admitted and does not hold `lobbyBypass`, calls `meetingGet`
- **THEN** the request answers 403

### Requirement: List and read the participants of a meeting
`participantList` (`GET /api/v1/meetings/{roomId}/participants`) SHALL list the participants currently in the meeting and `participantGet` SHALL return one of them, as live snapshots (identity, name, `externalId`, `metadata`, role, join date, media and hand state; see the OpenAPI). Both SHALL require `meetingRead`, and in a room with the waiting room on, a room member token SHALL also belong to someone admitted to the running meeting or holding `lobbyBypass` (see `waiting-room`). `participantList` SHALL answer 404 without a meeting and `participantGet` 404 for anyone not in it. Recorders and agents SHALL never be listed, counted or returned.

#### Scenario: List participants
- **GIVEN** a meeting with two participants and a recording in progress
- **WHEN** a client holding `meetingRead` calls `participantList`
- **THEN** exactly the two participants are listed, each with its current media state

#### Scenario: Participant not in the meeting
- **WHEN** a client calls `participantGet` for an identity that is not in the meeting
- **THEN** the request answers 404
