## ADDED Requirements

### Requirement: A recording's end frees the room before it is reported
When the media server reports the end of a recording process, the server SHALL make the room recordable again even if it holds no in-progress recording for it, and SHALL send `recordingEnded` and the meeting's end notice only after the room is recordable again, so a start requested on receiving either is not refused.

#### Scenario: Start right after recordingEnded
- **GIVEN** a registered webhook endpoint and a meeting whose recording has just ended
- **WHEN** the endpoint receives `recordingEnded` and calls `startRecording` for the room at once
- **THEN** the REST API answers `201`

#### Scenario: End of a recording that was never stored
- **GIVEN** a room held for a recording whose start the server could not store
- **WHEN** the media server reports that recording's end
- **THEN** `startRecording` for the room answers `201` without waiting for the orphaned-hold clean-up
