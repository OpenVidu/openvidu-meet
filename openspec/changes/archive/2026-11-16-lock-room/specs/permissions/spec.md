## RENAMED Requirements

- FROM: `### Requirement: Waiting room permissions`
- TO: `### Requirement: Locked room permissions`

## MODIFIED Requirements

### Requirement: Moderator role defaults
A room created without permissions for its moderator role SHALL grant that role all twenty-four permissions. How the permissions given at creation combine with these defaults is specified in `room-access`.

#### Scenario: Default moderator
- **WHEN** a client creates a room without `roles`
- **THEN** the moderator role grants every permission, `broadcastControl`, `broadcastEdit`, `accessBypassLock` and `waitingParticipantAdmin` included

### Requirement: Speaker role defaults
A room created without permissions for its speaker role SHALL grant that role `recordingList`, `recordingPlay`, `recordingDownload`, `meetingJoin`, `meetingRead`, `participantReactionSend`, `mediaPublishAudio`, `mediaPublishVideo`, `mediaShareScreen`, `mediaChangeVirtualBackground`, `chatRead` and `chatWrite`, and deny the other twelve.

#### Scenario: Default speaker
- **WHEN** a client creates a room without `roles`
- **THEN** the speaker role denies `recordingControl`, `recordingDelete`, `broadcastControl`, `broadcastEdit`, `roomShareAccessLinks`, `participantPromote`, `participantKick`, `participantMute`, `participantHandLower`, `accessBypassLock`, `waitingParticipantAdmin` and `meetingEnd`, and grants every other permission

### Requirement: Permissions missing from older data
When a room member token, or a room or member stored before a permission existed, lacks that permission, Meet SHALL complete it as follows. A value present SHALL always win.
- `meetingRead` takes the value of `meetingJoin`.
- `participantMute`, `broadcastControl` and `broadcastEdit` are denied.
- `participantHandLower`, `accessBypassLock` and `waitingParticipantAdmin` are denied in a token, and granted to the moderator role and to members with the moderator role.
- `participantReactionSend` is granted.

#### Scenario: Room from before 3.9.0
- **GIVEN** a room created before 3.9.0 with default roles
- **WHEN** the deployment is upgraded and a manager reads the room's roles
- **THEN** both roles grant `meetingRead` and `participantReactionSend` and deny `participantMute`
- **AND** only the moderator role grants `participantHandLower`, `accessBypassLock` and `waitingParticipantAdmin`

#### Scenario: Room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role still grants `participantMute` and grants `participantHandLower` and `participantReactionSend`, and the speaker role denies `participantHandLower`
- **AND** both roles deny `broadcastControl` and `broadcastEdit`

#### Scenario: Waiting room permissions of a room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role grants `accessBypassLock` and `waitingParticipantAdmin` and the speaker role denies both

#### Scenario: Moderator member from 3.9.0
- **GIVEN** a member stored by 3.9.0 with the moderator role and no override of the hand permission
- **WHEN** the deployment is upgraded to 3.10.0 and a manager reads the member
- **THEN** the member's effective permissions grant `participantHandLower`

#### Scenario: Waiting room permissions of a moderator member from 3.9.0
- **GIVEN** a member stored by 3.9.0 with the moderator role
- **WHEN** the deployment is upgraded to 3.10.0 and a manager reads the member
- **THEN** the member's effective permissions grant `accessBypassLock` and `waitingParticipantAdmin`

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
- **WHEN** its holder calls `waitingParticipantList` after the upgrade to 3.10.0
- **THEN** the token is read as denying `waitingParticipantAdmin` and the server answers `403`

### Requirement: Permissions of the caller
For a request about a room, the server SHALL use the permissions carried by the room member token when one is presented, narrowed in a locked room as `locked-room` specifies, and none when that token belongs to another room; otherwise those of the user: every permission for an admin or the room's owner, the member's effective permissions for a member, the room's speaker role permissions under registered-user access (see `room-access`), and none otherwise.

#### Scenario: Token of another room
- **GIVEN** a moderator's room member token for room A
- **WHEN** its holder calls `meetingEnd` for room B
- **THEN** the server answers `403`

#### Scenario: Member using their account
- **GIVEN** a user member whose effective permissions deny `recordingDelete`
- **WHEN** they delete one of the room's recordings with their access token
- **THEN** the server answers `403`

#### Scenario: Token without a participant identity behind a waiting room
- **GIVEN** a locked room and a moderator link token obtained without joining
- **WHEN** its holder calls `participantKick`
- **THEN** the server answers `403`

### Requirement: Permissions without a deprecated name
`meetingRead`, `participantMute`, `participantHandLower`, `participantReactionSend`, `broadcastControl`, `broadcastEdit`, `accessBypassLock` and `waitingParticipantAdmin` SHALL exist only under their current names: no deprecated key sets them, and no response adds a deprecated twin for them.

#### Scenario: Read back without a twin
- **WHEN** a manager reads a room's `roles`
- **THEN** each role carries `meetingRead`, `participantMute`, `participantHandLower`, `participantReactionSend`, `broadcastControl`, `broadcastEdit`, `accessBypassLock` and `waitingParticipantAdmin` under those names only

#### Scenario: Deprecated join key leaves meetingRead alone
- **GIVEN** a speaker role that grants `meetingRead`
- **WHEN** a manager calls `updateRoomRoles` with `canJoinMeeting` `false` for the speaker role
- **THEN** the speaker role denies `meetingJoin` and still grants `meetingRead`

### Requirement: Locked room permissions
Meet SHALL gate the locked room with two permissions (`locked-room`):
- `accessBypassLock`: its holder joins a locked room without waiting;
- `waitingParticipantAdmin`: its holder lists, admits and rejects the participants waiting.

#### Scenario: Admitting without the permission
- **GIVEN** a room member token denying `waitingParticipantAdmin`
- **WHEN** its holder calls `waitingParticipantAdmit`
- **THEN** the server answers `403`

#### Scenario: Admitter who waits
- **GIVEN** a locked room and a member granted `waitingParticipantAdmin` and denied `accessBypassLock`
- **WHEN** the member asks to join
- **THEN** they wait like any participant without `accessBypassLock`
