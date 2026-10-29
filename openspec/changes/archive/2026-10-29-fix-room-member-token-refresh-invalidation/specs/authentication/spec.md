## MODIFIED Requirements

### Requirement: Demotion revokes room member tokens
The server SHALL reject with `401` every room member token issued to a participant before they were demoted from moderator (`participantRoleUpdate` or `participantUpdateRole`, see `meeting-moderation`), on every replica and for as long as such a token could still be valid, while a token issued to them after the demotion is accepted. Only `refreshRoomMemberToken` SHALL still renew it, into a token with the restored permissions (see `room-members`).

#### Scenario: Demoted on another replica
- **GIVEN** two Meet replicas and a participant promoted to moderator who holds a room member token issued during the promotion
- **WHEN** a moderator demotes that participant through the first replica
- **AND** the participant presents the earlier token to the second replica
- **THEN** the second replica answers `401` with message `Invalid token`
