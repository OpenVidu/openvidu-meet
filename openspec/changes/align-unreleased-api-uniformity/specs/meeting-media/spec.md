## MODIFIED Requirements

### Requirement: End-to-end encrypted rooms
A room whose `e2ee.enabled` is `true` SHALL have its meetings end-to-end encrypted; the field defaults to `false`. An encrypted room SHALL never be recorded, which `recordings` specifies, so its meeting offers no recording control.

#### Scenario: Default
- **GIVEN** a `roomCreate` request whose config omits `e2ee`
- **WHEN** the room is created
- **THEN** its `config.e2ee.enabled` is `false`

#### Scenario: No recording control
- **GIVEN** a room with `e2ee.enabled` set to `true`
- **WHEN** a participant allowed to record joins its meeting with the encryption key
- **THEN** the meeting offers no control to start a recording
