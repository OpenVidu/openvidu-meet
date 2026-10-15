## ADDED Requirements

### Requirement: Broadcast permissions
Meet SHALL gate live broadcasts with two permissions, whose behavior `live-broadcast` specifies:
- `broadcastControl`: start and stop the live broadcasts of the meeting to the room's destinations.
- `broadcastAddDestinations`: stream the meeting to a destination the room does not have, which also needs `broadcastControl`.

#### Scenario: Room destinations only
- **GIVEN** a room member token granting `broadcastControl` and denying `broadcastAddDestinations`
- **WHEN** its holder calls `broadcastStart` once with a room destination and once with a destination given by name and URL
- **THEN** the first answers `201` and the second `403`

## MODIFIED Requirements

### Requirement: Permission keys
Meet SHALL express what a principal may do in a room with exactly the twenty-two boolean permissions listed by the following requirements, each a flat key of every permission object: room role sets, member overrides and effective permissions, and room member tokens. A request SHALL fail with `422` when a permission carries a value that is not a boolean, and SHALL ignore any key that is not a permission.

#### Scenario: Unknown key ignored
- **WHEN** a manager calls `updateRoomMember` with `customPermissions` `{ "recordingControl": true, "canFly": true }`
- **THEN** the server answers `200`
- **AND** the member's `customPermissions` hold `recordingControl` (and its deprecated twin `canRecord`) and nothing about `canFly`

#### Scenario: Non-boolean value
- **WHEN** a manager calls `updateRoomRoles` giving `chatWrite` the value `"yes"`
- **THEN** the server answers `422` and the roles are unchanged

### Requirement: Moderator role defaults
A room created without permissions for its moderator role SHALL grant that role all twenty-two permissions. How the permissions given at creation combine with these defaults is specified in `room-access`.

#### Scenario: Default moderator
- **WHEN** a client creates a room without `roles`
- **THEN** the moderator role grants every permission, `broadcastControl` and `broadcastAddDestinations` included

### Requirement: Speaker role defaults
A room created without permissions for its speaker role SHALL grant that role `recordingList`, `recordingPlay`, `recordingDownload`, `meetingJoin`, `meetingRead`, `participantReactionSend`, `mediaPublishAudio`, `mediaPublishVideo`, `mediaShareScreen`, `mediaChangeVirtualBackground`, `chatRead` and `chatWrite`, and deny the other ten.

#### Scenario: Default speaker
- **WHEN** a client creates a room without `roles`
- **THEN** the speaker role denies `recordingControl`, `recordingDelete`, `broadcastControl`, `broadcastAddDestinations`, `roomShareAccessLinks`, `participantPromote`, `participantKick`, `participantMute`, `participantHandLower` and `meetingEnd`, and grants every other permission

### Requirement: Permissions missing from older data
When a room member token, or a room or member stored before a permission existed, lacks that permission, Meet SHALL complete it: `meetingRead` with the value of `meetingJoin`, `participantMute`, `participantHandLower`, `broadcastControl` and `broadcastAddDestinations` denied, and `participantReactionSend` granted. A value present SHALL always win.

#### Scenario: Room from before 3.9.0
- **GIVEN** a room created before 3.9.0 with default roles
- **WHEN** the deployment is upgraded and a manager reads the room's roles
- **THEN** both roles grant `meetingRead` and `participantReactionSend` and deny `participantMute` and `participantHandLower`

#### Scenario: Room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role still grants `participantMute`, denies `participantHandLower` and grants `participantReactionSend`
- **AND** both roles deny `broadcastControl` and `broadcastAddDestinations`

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

### Requirement: Permissions without a deprecated name
`meetingRead`, `participantMute`, `participantHandLower`, `participantReactionSend`, `broadcastControl` and `broadcastAddDestinations` SHALL exist only under their current names: no deprecated key sets them, and no response adds a deprecated twin for them.

#### Scenario: Read back without a twin
- **WHEN** a manager reads a room's `roles`
- **THEN** each role carries `meetingRead`, `participantMute`, `participantHandLower`, `participantReactionSend`, `broadcastControl` and `broadcastAddDestinations` under those names only

#### Scenario: Deprecated join key leaves meetingRead alone
- **GIVEN** a speaker role that grants `meetingRead`
- **WHEN** a manager calls `updateRoomRoles` with `canJoinMeeting` `false` for the speaker role
- **THEN** the speaker role denies `meetingJoin` and still grants `meetingRead`
