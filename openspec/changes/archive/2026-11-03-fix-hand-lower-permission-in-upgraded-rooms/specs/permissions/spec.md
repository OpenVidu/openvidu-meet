## MODIFIED Requirements

### Requirement: Permissions missing from older data
When a room member token, or a room or member stored before a permission existed, lacks that permission, Meet SHALL complete it: `meetingRead` with the value of `meetingJoin`, `participantMute` denied, `participantHandLower` denied in a token and granted to the moderator role and to members with the moderator role, and `participantReactionSend` granted. A value present SHALL always win.

#### Scenario: Room from before 3.9.0
- **GIVEN** a room created before 3.9.0 with default roles
- **WHEN** the deployment is upgraded and a manager reads the room's roles
- **THEN** both roles grant `meetingRead` and `participantReactionSend` and deny `participantMute`, and only the moderator role grants `participantHandLower`

#### Scenario: Room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role still grants `participantMute` and grants `participantHandLower` and `participantReactionSend`, and the speaker role denies `participantHandLower`

#### Scenario: Moderator member from 3.9.0
- **GIVEN** a member stored by 3.9.0 with the moderator role and no override of the hand permission
- **WHEN** the deployment is upgraded to 3.10.0 and a manager reads the member
- **THEN** the member's effective permissions grant `participantHandLower`

#### Scenario: Member overrides from before 3.9.0
- **GIVEN** a member stored before 3.9.0 whose overrides denied joining the meeting
- **WHEN** the deployment is upgraded
- **THEN** the member's overrides deny both `meetingJoin` and `meetingRead`

#### Scenario: Token of a meeting in progress
- **GIVEN** a room member token issued before `meetingRead` existed, granting the join permission
- **WHEN** its holder calls `meetingGet` after the upgrade
- **THEN** the token is read as granting `meetingRead` and the server answers `200`
