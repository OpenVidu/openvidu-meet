## MODIFIED Requirements

### Requirement: Reading broadcasts
`broadcastList` SHALL return the broadcasts in progress in the meeting of the room its required `roomId` query parameter names, and `broadcastGet` one broadcast, to an API key or a room member token holding `meetingRead` in that room; in a room with the waiting room on, the token SHALL also belong to someone admitted to the running meeting or holding `lobbyBypass` (see `waiting-room`). A broadcast that has ended SHALL leave the list and answer `404`. Every broadcast operation SHALL return only the fields asked for through `fields` or `X-Fields`.

#### Scenario: Ended broadcast
- **GIVEN** a broadcast that has been stopped
- **WHEN** `broadcastGet` is called for it
- **THEN** the REST API answers `404`

#### Scenario: Field selection
- **WHEN** `broadcastList` is called with `fields` `broadcastId,status`
- **THEN** each broadcast carries only `broadcastId` and `status`

#### Scenario: Token holding meetingJoin alone
- **WHEN** `broadcastList` is called with a room member token without `meetingRead`
- **THEN** the REST API answers `403`

#### Scenario: List without its room
- **WHEN** `broadcastList` is called without `roomId`
- **THEN** the REST API answers `422`

#### Scenario: Waiting participant
- **GIVEN** a room with the waiting room on, broadcasting, and a participant waiting whose role grants `meetingRead`
- **WHEN** their client calls `broadcastList` for the room
- **THEN** the REST API answers `403`
