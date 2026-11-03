## ADDED Requirements

### Requirement: A refused stop does not keep a stale recording in progress
When the clean-up of stale recordings cannot stop the media server's recording process of a stale recording because the media server refuses, and that process is neither starting nor active, the server SHALL end the recording as `aborted`, report it like any other end and make its room recordable again.

#### Scenario: Recording stuck in ending
- **GIVEN** a recording whose process the media server lists as ending and refuses to stop, in a room that no longer exists
- **WHEN** the clean-up runs
- **THEN** the recording is marked `aborted`
- **AND** the endpoint of a registered webhook receives `recordingEnded` with status `aborted`
