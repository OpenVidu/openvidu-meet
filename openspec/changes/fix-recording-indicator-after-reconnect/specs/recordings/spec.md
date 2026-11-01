## ADDED Requirements

### Requirement: Recording status after a reconnection
A participant that reconnects to a meeting SHALL receive the current state of the meeting's latest recording, including an end that happened while the participant was away, so the recording mark and an embedded host's `recordingStatusChanged` never keep a recording that has ended.

#### Scenario: Recording ended during an outage
- **GIVEN** a participant in a meeting with an active recording whose connection drops
- **AND** a moderator stops the recording while the participant is away
- **WHEN** the participant reconnects
- **THEN** the recording mark is no longer shown
- **AND** an embedded host receives `recordingStatusChanged` with the final status

#### Scenario: Recording still in progress
- **GIVEN** a participant whose connection drops during an active recording
- **WHEN** the participant reconnects with the recording still active
- **THEN** the recording mark is shown with the time elapsed
