## MODIFIED Requirements

### Requirement: Starting a recording through the REST API
`startRecording` SHALL accept only an API key or a room member token holding `recordingControl` in
the target room, and SHALL answer `201` with the recording in the `starting` status and a `Location`
header pointing at it, without waiting for the recording to capture media. It SHALL answer `404` for
an unknown room, `409` when nobody is connected to the room, `409` while the room already has a
recording `starting`, `active` or `ending`, and `503` when the media server does not accept it.

#### Scenario: Start with an API key
- **GIVEN** a room with recording enabled and a meeting in progress
- **WHEN** `startRecording` is called with an API key
- **THEN** the REST API answers `201` with a recording in the `starting` status and a `Location` header

#### Scenario: User access token not accepted
- **WHEN** `startRecording` is called with only a user access token, even an `admin` one
- **THEN** the REST API answers `401`

#### Scenario: Room member token without the permission
- **WHEN** `startRecording` is called with a room member token lacking `recordingControl`, or issued for another room
- **THEN** the REST API answers `403`

#### Scenario: Unknown room
- **WHEN** `startRecording` is called for a room that does not exist
- **THEN** the REST API answers `404`

#### Scenario: No meeting in progress
- **GIVEN** a room with recording enabled and nobody connected
- **WHEN** `startRecording` is called for it
- **THEN** the REST API answers `409`

#### Scenario: Room already being recorded
- **GIVEN** a room whose recording is active
- **WHEN** `startRecording` is called for it again
- **THEN** the REST API answers `409`

#### Scenario: Media server does not accept the recording
- **GIVEN** a room with recording enabled and a meeting in progress
- **AND** a media server that has no recorder available, or cannot be reached
- **WHEN** `startRecording` is called for it
- **THEN** the REST API answers `503`
- **AND** no recording is created and the room has no recording in progress
