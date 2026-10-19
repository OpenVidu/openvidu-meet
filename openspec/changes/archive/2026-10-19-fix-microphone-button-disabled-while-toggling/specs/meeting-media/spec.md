## ADDED Requirements

### Requirement: Device buttons wait for the change in progress
While turning the camera or the microphone on or off from the meeting toolbar is in progress, that device's toolbar button SHALL be disabled, and it SHALL be enabled again once the change has been applied or has failed.

#### Scenario: Microphone change in progress
- **GIVEN** a participant in a meeting with the microphone on
- **WHEN** they press the microphone button
- **THEN** the button is disabled until the microphone is muted
- **AND** it is enabled again afterwards

#### Scenario: Camera change in progress
- **GIVEN** a participant in a meeting with the camera off
- **WHEN** they press the camera button
- **THEN** the button is disabled until the camera is on
- **AND** it is enabled again afterwards
