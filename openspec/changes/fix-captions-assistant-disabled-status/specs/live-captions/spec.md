## MODIFIED Requirements

### Requirement: No assistant while captions are disabled
`createAiAssistant` SHALL be rejected with `403`, and SHALL start no assistant, when the deployment has captions off or the caller's room has `captions.enabled` set to `false`.

#### Scenario: Deployment with captions off
- **GIVEN** a deployment without `MEET_CAPTIONS_ENABLED=true`
- **WHEN** a participant calls `createAiAssistant`
- **THEN** the request fails with `403`
- **AND** no captions assistant is started

#### Scenario: Room with captions off
- **GIVEN** a deployment with captions on and a room with `captions.enabled` set to `false`
- **WHEN** a participant of that room calls `createAiAssistant`
- **THEN** the request fails with `403`
- **AND** no captions assistant is started
