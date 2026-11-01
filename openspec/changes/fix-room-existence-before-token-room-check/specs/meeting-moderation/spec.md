## MODIFIED Requirements

### Requirement: Who may moderate
The moderation operations SHALL accept an API key, which acts with every permission, or a room member token for that room holding the operation's permission: `participantKick` to kick, `participantMute` to mute, `participantPromote` to promote or demote. A token for another room SHALL get 403 whether or not the room exists, a token lacking the permission 403, a request without credentials 401, and an API key for a room that does not exist 404.

#### Scenario: API key
- **GIVEN** a running meeting
- **WHEN** a backend calls `participantKick` with the API key
- **THEN** the participant is kicked

#### Scenario: Token without the permission
- **GIVEN** a room member token for the room without `participantMute`
- **WHEN** it calls `participantMute`
- **THEN** the request answers 403 and nothing is muted

#### Scenario: Unknown room
- **WHEN** a backend calls `participantKick` with the API key for a room that does not exist
- **THEN** the request answers 404

#### Scenario: Token of another room
- **GIVEN** a client holding `participantKick` in room A
- **WHEN** it calls `participantKick` for room B, once with an existing room and once with a room that does not exist
- **THEN** the request answers 403 to both
