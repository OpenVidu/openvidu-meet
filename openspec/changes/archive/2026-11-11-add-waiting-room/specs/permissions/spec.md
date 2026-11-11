## ADDED Requirements

### Requirement: Waiting room permissions
Meet SHALL gate the waiting room with two permissions (`waiting-room`):
- `waitingRoomBypass`: its holder joins a room with the waiting room on without waiting;
- `waitingRoomAdmin`: its holder lists, admits and rejects the participants waiting.

#### Scenario: Admitting without the permission
- **GIVEN** a room member token denying `waitingRoomAdmin`
- **WHEN** its holder calls `participantWaitingAdmit`
- **THEN** the server answers `403`

#### Scenario: Admitter who waits
- **GIVEN** a room with the waiting room on and a member granted `waitingRoomAdmin` and denied `waitingRoomBypass`
- **WHEN** the member asks to join
- **THEN** they wait like any participant without `waitingRoomBypass`

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
- **THEN** the moderator role grants every permission, `broadcastControl`, `broadcastEdit`, `waitingRoomBypass` and `waitingRoomAdmin` included

### Requirement: Speaker role defaults
A room created without permissions for its speaker role SHALL grant that role `recordingList`, `recordingPlay`, `recordingDownload`, `meetingJoin`, `meetingRead`, `participantReactionSend`, `mediaPublishAudio`, `mediaPublishVideo`, `mediaShareScreen`, `mediaChangeVirtualBackground`, `chatRead` and `chatWrite`, and deny the other twelve.

#### Scenario: Default speaker
- **WHEN** a client creates a room without `roles`
- **THEN** the speaker role denies `recordingControl`, `recordingDelete`, `broadcastControl`, `broadcastEdit`, `roomShareAccessLinks`, `participantPromote`, `participantKick`, `participantMute`, `participantHandLower`, `waitingRoomBypass`, `waitingRoomAdmin` and `meetingEnd`, and grants every other permission

### Requirement: Permissions missing from older data
When a room member token, or a room or member stored before a permission existed, lacks that permission, Meet SHALL complete it as follows. A value present SHALL always win.
- `meetingRead` takes the value of `meetingJoin`.
- `participantMute`, `broadcastControl` and `broadcastEdit` are denied.
- `participantHandLower`, `waitingRoomBypass` and `waitingRoomAdmin` are denied in a token, and granted to the moderator role and to members with the moderator role.
- `participantReactionSend` is granted.

#### Scenario: Room from before 3.9.0
- **GIVEN** a room created before 3.9.0 with default roles
- **WHEN** the deployment is upgraded and a manager reads the room's roles
- **THEN** both roles grant `meetingRead` and `participantReactionSend` and deny `participantMute`
- **AND** only the moderator role grants `participantHandLower`, `waitingRoomBypass` and `waitingRoomAdmin`

#### Scenario: Room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role still grants `participantMute` and grants `participantHandLower` and `participantReactionSend`, and the speaker role denies `participantHandLower`
- **AND** both roles deny `broadcastControl` and `broadcastEdit`

#### Scenario: Waiting room permissions of a room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role grants `waitingRoomBypass` and `waitingRoomAdmin` and the speaker role denies both

#### Scenario: Moderator member from 3.9.0
- **GIVEN** a member stored by 3.9.0 with the moderator role and no override of the hand permission
- **WHEN** the deployment is upgraded to 3.10.0 and a manager reads the member
- **THEN** the member's effective permissions grant `participantHandLower`

#### Scenario: Waiting room permissions of a moderator member from 3.9.0
- **GIVEN** a member stored by 3.9.0 with the moderator role
- **WHEN** the deployment is upgraded to 3.10.0 and a manager reads the member
- **THEN** the member's effective permissions grant `waitingRoomBypass` and `waitingRoomAdmin`

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
- **GIVEN** a moderator's room member token issued by 3.9.0
- **WHEN** its holder calls `participantWaitingList` after the upgrade to 3.10.0
- **THEN** the token is read as denying `waitingRoomAdmin` and the server answers `403`

### Requirement: Admins, the owner and the API key hold every permission
The server SHALL treat an admin, the room's owner and a request authenticated with the API key as holding every permission in the room, whatever the room's role sets say, both when it checks a request and in the room member tokens it issues to an admin or the owner (a room member token is read as `Permissions of the caller` says).

#### Scenario: Owner beyond the moderator role
- **GIVEN** a room whose moderator role denies `recordingDelete`
- **WHEN** its owner deletes one of the room's recordings
- **THEN** the deletion succeeds

#### Scenario: Integrator with the API key
- **GIVEN** a room whose role sets deny `participantKick` to everyone
- **WHEN** an integrator calls `participantKick` with the API key
- **THEN** the participant is removed from the meeting

### Requirement: Permissions of the caller
For a request about a room, the server SHALL use the permissions carried by the room member token when one is presented, narrowed in a room with the waiting room on as `waiting-room` specifies, and none when that token belongs to another room; otherwise those of the user: every permission for an admin or the room's owner, the member's effective permissions for a member, the room's speaker role permissions under registered-user access (see `room-access`), and none otherwise.

#### Scenario: Token of another room
- **GIVEN** a moderator's room member token for room A
- **WHEN** its holder calls `meetingEnd` for room B
- **THEN** the server answers `403`

#### Scenario: Member using their account
- **GIVEN** a user member whose effective permissions deny `recordingDelete`
- **WHEN** they delete one of the room's recordings with their access token
- **THEN** the server answers `403`

#### Scenario: Token without a participant identity behind a waiting room
- **GIVEN** a room with the waiting room on and a moderator link token obtained without joining
- **WHEN** its holder calls `participantKick`
- **THEN** the server answers `403`

### Requirement: Permissions without a deprecated name
`meetingRead`, `participantMute`, `participantHandLower`, `participantReactionSend`, `broadcastControl`, `broadcastEdit`, `waitingRoomBypass` and `waitingRoomAdmin` SHALL exist only under their current names: no deprecated key sets them, and no response adds a deprecated twin for them.

#### Scenario: Read back without a twin
- **WHEN** a manager reads a room's `roles`
- **THEN** each role carries `meetingRead`, `participantMute`, `participantHandLower`, `participantReactionSend`, `broadcastControl`, `broadcastEdit`, `waitingRoomBypass` and `waitingRoomAdmin` under those names only

#### Scenario: Deprecated join key leaves meetingRead alone
- **GIVEN** a speaker role that grants `meetingRead`
- **WHEN** a manager calls `updateRoomRoles` with `canJoinMeeting` `false` for the speaker role
- **THEN** the speaker role denies `meetingJoin` and still grants `meetingRead`
