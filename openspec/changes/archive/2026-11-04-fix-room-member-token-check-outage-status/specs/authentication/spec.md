## ADDED Requirements

### Requirement: A server failure is not an authentication failure
When the server cannot check a credential because MongoDB or Redis fails, it SHALL answer `500`, never `401` or `403`. Only a credential that is invalid, expired or revoked SHALL be refused with `401`.

#### Scenario: Database unreachable during a renewal
- **GIVEN** a participant in a meeting and MongoDB unreachable for longer than the driver buffers commands
- **WHEN** their client calls `refreshRoomMemberToken`
- **THEN** the server answers `500`
- **AND** the participant stays in the meeting

#### Scenario: Invalid token
- **WHEN** a client calls `refreshRoomMemberToken` with a token that is not valid
- **THEN** the server answers `401`
