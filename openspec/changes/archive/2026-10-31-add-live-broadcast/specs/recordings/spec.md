## ADDED Requirements

### Requirement: A lost recording never blocks the room
When the egress service recording a meeting stops responding, the server SHALL end the recording `failed`, with the error `The egress service stopped responding`, send its `recordingEnded` webhook and make the room recordable again, instead of keeping the recording in progress.

#### Scenario: Egress service killed while recording
- **GIVEN** a meeting with an active recording
- **WHEN** the egress service running the recording dies
- **THEN** the recording ends `failed` and `recordingEnded` is sent
- **AND** `stopRecording` for it answers `409`
- **AND** `startRecording` for the room answers `201` once an egress service is available

#### Scenario: Next meeting of the room
- **GIVEN** a room whose recording was lost that way
- **WHEN** a new meeting starts in the room
- **THEN** `meetingGet` reports no recording in progress

## MODIFIED Requirements

### Requirement: Starting a recording through the REST API
`startRecording` SHALL accept only an API key or a room member token holding `recordingControl` in
the target room, and SHALL answer `201` with the recording in the `starting` status and a `Location`
header pointing at it, without waiting for the recording to capture media. It SHALL answer `404` for
an unknown room, `409` when nobody is connected to the room or a recording is `starting`, `active` or
`ending` in it, and `503` when no egress service takes the recording.

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
- **GIVEN** a room with recording enabled, a meeting in progress and the deployment's egress service down
- **WHEN** `startRecording` is called for it
- **THEN** the REST API answers `503` with error `LiveKit Error`
- **AND** no recording is created and the room has no recording in progress
- **AND** a later `startRecording`, once the egress service is back, answers `201`
