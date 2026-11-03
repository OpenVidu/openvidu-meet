## ADDED Requirements

### Requirement: A repeated member update completes the one that failed
An `updateRoomMember` request that leaves a member's stored permissions unchanged SHALL still apply those permissions to the member's live participant when they are in a meeting, without revoking their tokens and without asking their client to renew.

#### Scenario: Retry after a failed push
- **GIVEN** a member in the meeting whose `mediaPublishVideo` was denied, the change stored and the push to the media server failed
- **WHEN** the integrator sends the same update again
- **THEN** the media server stops accepting the member's camera
- **AND** the member's tokens stay valid

#### Scenario: Update that changes nothing for a member outside the meeting
- **GIVEN** a member who is not in a meeting
- **WHEN** an update that changes nothing is sent
- **THEN** the server answers `200` and nothing else happens
