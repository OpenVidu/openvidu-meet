## ADDED Requirements

### Requirement: An earlier join token does not restore revoked access
A participant who connects to the meeting with a join token issued before a change that revoked it (a demotion, a member update, a role change of the user, the deletion of the member) SHALL be removed from the meeting, and the grant and metadata of that earlier token SHALL NOT be used to renew the participant's token or to authorize any action. A participant who reconnects with the credentials of their own current session SHALL stay in the meeting.

#### Scenario: Demoted moderator reconnects with the promotion token
- **GIVEN** a speaker promoted to moderator during the meeting and then demoted
- **WHEN** their client disconnects and connects again with the token it held while promoted
- **THEN** that session is removed from the meeting
- **AND** `refreshRoomMemberToken` never issues a token carrying the moderator permissions

#### Scenario: Revoked chat and camera stay revoked
- **GIVEN** a member in the meeting whose `chatWrite` and `mediaPublishVideo` were revoked by a member update
- **WHEN** their client reconnects with the join token issued before the update
- **THEN** that session is removed and neither data nor camera is accepted from it

#### Scenario: Reconnection after a permission change
- **GIVEN** a member whose permissions were updated during the meeting and whose connection drops
- **WHEN** their client reconnects with the credentials it holds for its current session
- **THEN** it stays in the meeting with the updated permissions

#### Scenario: Join processed by another replica
- **GIVEN** two Meet replicas and a demotion handled by replica A
- **WHEN** replica B processes the join of a session using a token issued before the demotion
- **THEN** that session is removed
