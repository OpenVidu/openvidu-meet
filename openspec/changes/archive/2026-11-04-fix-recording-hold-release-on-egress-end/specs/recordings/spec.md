## ADDED Requirements

### Requirement: A recording's end frees the room before it is reported
When the media server reports the end of a recording process, the server SHALL make the room recordable again, even if it never stored that recording, and SHALL send `recordingEnded` and the meeting's end notice only after the room is recordable again, so a start requested on receiving either is not refused. An end reported again for a recording that has already ended SHALL leave the room as it is.

#### Scenario: Start right after recordingEnded
- **GIVEN** a registered webhook endpoint and a meeting whose recording has just ended
- **WHEN** the endpoint receives `recordingEnded` and calls `startRecording` for the room at once
- **THEN** the REST API answers `201`

#### Scenario: End of a recording that was never stored
- **GIVEN** a room held for a recording whose start the server could not store
- **WHEN** the media server reports that recording's end
- **THEN** `startRecording` for the room answers `201` without waiting for the orphaned-hold clean-up

#### Scenario: A repeated end leaves a newer recording's hold
- **GIVEN** a meeting whose recording has ended and a new recording requested right after
- **WHEN** the end of the first recording is reported again, by another replica or a later clean-up, before the new recording is in progress
- **THEN** a further `startRecording` for the room answers `409`
