## ADDED Requirements

### Requirement: Waiting room permissions
Meet SHALL gate the waiting room with two permissions (`waiting-room`):
- `lobbyBypass`: its holder joins a room with the waiting room on without waiting, and reads the meeting there;
- `lobbyAdmin`: its holder lists, admits and rejects the participants waiting.

#### Scenario: Admitting without the permission
- **GIVEN** a room member token denying `lobbyAdmin`
- **WHEN** its holder calls `lobbyResolve`
- **THEN** the server answers `403`

#### Scenario: Admitter who waits
- **GIVEN** a room with the waiting room on and a member granted `lobbyAdmin` and denied `lobbyBypass`
- **WHEN** the member asks to join
- **THEN** they wait like any participant without `lobbyBypass`

## MODIFIED Requirements

### Requirement: Permission keys
Meet SHALL express what a principal may do in a room with exactly the twenty-four boolean permissions listed by the following requirements, each a flat key of every permission object: room role sets, member overrides and effective permissions, and room member tokens. A request SHALL fail with `422` when a permission carries a value that is not a boolean, and SHALL ignore any key that is not a permission.

#### Scenario: Unknown key ignored
- **WHEN** a manager calls `updateRoomMember` with `customPermissions` `{ "recordingControl": true, "canFly": true }`
- **THEN** the server answers `200`
- **AND** the member's `customPermissions` hold `recordingControl` (and its deprecated twin `canRecord`) and nothing about `canFly`

#### Scenario: Non-boolean value
- **WHEN** a manager calls `updateRoomRoles` giving `chatWrite` the value `"yes"`
- **THEN** the server answers `422` and the roles are unchanged

### Requirement: Moderator role defaults
A room created without permissions for its moderator role SHALL grant that role all twenty-four permissions. How the permissions given at creation combine with these defaults is specified in `room-access`.

#### Scenario: Default moderator
- **WHEN** a client creates a room without `roles`
- **THEN** the moderator role grants every permission, `broadcastControl`, `broadcastEdit`, `lobbyBypass` and `lobbyAdmin` included

### Requirement: Speaker role defaults
A room created without permissions for its speaker role SHALL grant that role `recordingList`, `recordingPlay`, `recordingDownload`, `meetingJoin`, `meetingRead`, `participantReactionSend`, `mediaPublishAudio`, `mediaPublishVideo`, `mediaShareScreen`, `mediaChangeVirtualBackground`, `chatRead` and `chatWrite`, and deny the other twelve.

#### Scenario: Default speaker
- **WHEN** a client creates a room without `roles`
- **THEN** the speaker role denies `recordingControl`, `recordingDelete`, `broadcastControl`, `broadcastEdit`, `roomShareAccessLinks`, `participantPromote`, `participantKick`, `participantMute`, `participantHandLower`, `lobbyBypass`, `lobbyAdmin` and `meetingEnd`, and grants every other permission

### Requirement: Permissions missing from older data
When a room member token, or a room or member stored before a permission existed, lacks that permission, Meet SHALL complete it as follows. A value present SHALL always win.
- `meetingRead` takes the value of `meetingJoin`.
- `participantMute`, `broadcastControl` and `broadcastEdit` are denied.
- `participantHandLower`, `lobbyBypass` and `lobbyAdmin` are denied in a token, and granted to the moderator role and to members with the moderator role.
- `participantReactionSend` is granted.

#### Scenario: Room from before 3.9.0
- **GIVEN** a room created before 3.9.0 with default roles
- **WHEN** the deployment is upgraded and a manager reads the room's roles
- **THEN** both roles grant `meetingRead` and `participantReactionSend` and deny `participantMute`
- **AND** only the moderator role grants `participantHandLower`, `lobbyBypass` and `lobbyAdmin`

#### Scenario: Room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role still grants `participantMute` and grants `participantHandLower` and `participantReactionSend`, and the speaker role denies `participantHandLower`
- **AND** both roles deny `broadcastControl` and `broadcastEdit`

#### Scenario: Room from 3.10.0
- **GIVEN** a room created by 3.10.0 with default roles
- **WHEN** the deployment is upgraded to the release that adds the waiting room
- **THEN** the moderator role grants `lobbyBypass` and `lobbyAdmin` and the speaker role denies both

#### Scenario: Moderator member from 3.9.0
- **GIVEN** a member stored by 3.9.0 with the moderator role and no override of the hand permission
- **WHEN** the deployment is upgraded to 3.10.0 and a manager reads the member
- **THEN** the member's effective permissions grant `participantHandLower`

#### Scenario: Moderator member from 3.10.0
- **GIVEN** a member stored by 3.10.0 with the moderator role
- **WHEN** the deployment is upgraded to the release that adds the waiting room and a manager reads the member
- **THEN** the member's effective permissions grant `lobbyBypass` and `lobbyAdmin`

#### Scenario: Member overrides from before 3.9.0
- **GIVEN** a member stored before 3.9.0 whose overrides denied joining the meeting
- **WHEN** the deployment is upgraded
- **THEN** the member's overrides deny both `meetingJoin` and `meetingRead`

#### Scenario: Token of a meeting in progress
- **GIVEN** a room member token issued before `meetingRead` existed, granting the join permission
- **WHEN** its holder calls `meetingGet` after the upgrade
- **THEN** the token is read as granting `meetingRead` and the server answers `200`

#### Scenario: Moderator token issued by 3.9.0
- **GIVEN** a moderator's room member token issued by 3.9.0
- **WHEN** its holder calls `broadcastStart` after the upgrade
- **THEN** the token is read as denying `broadcastControl` and the server answers `403`

#### Scenario: Moderator token issued before the waiting room
- **GIVEN** a moderator's room member token issued before the upgrade that adds the waiting room
- **WHEN** its holder calls `lobbyList` after the upgrade
- **THEN** the token is read as denying `lobbyAdmin` and the server answers `403`
