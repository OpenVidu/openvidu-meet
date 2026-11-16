## MODIFIED Requirements

### Requirement: Participant permissions
Meet SHALL gate actions on participants with five permissions:
- `participantPromote`: promote or demote another participant (`meeting-moderation`).
- `participantKick`: remove another participant (`meeting-moderation`).
- `participantMute`: turn off another participant's microphone, camera or screen (`meeting-moderation`).
- `participantLowerHand`: lower other participants' raised hands (`raise-hand`).
- `participantSendReaction`: send reactions (`reactions`).

#### Scenario: Kick without permission
- **GIVEN** a room member token obtained with the anonymous speaker link of a room with default roles
- **WHEN** its holder calls `participantKick`
- **THEN** the server answers `403`

### Requirement: Speaker role defaults
A room created without permissions for its speaker role SHALL grant that role `recordingList`, `recordingPlay`, `recordingDownload`, `meetingJoin`, `meetingRead`, `participantSendReaction`, `mediaPublishAudio`, `mediaPublishVideo`, `mediaShareScreen`, `mediaChangeVirtualBackground`, `chatRead` and `chatWrite`, and deny the other twelve.

#### Scenario: Default speaker
- **WHEN** a client creates a room without `roles`
- **THEN** the speaker role denies `recordingControl`, `recordingDelete`, `broadcastControl`, `broadcastEdit`, `roomShareAccessLinks`, `participantPromote`, `participantKick`, `participantMute`, `participantLowerHand`, `accessBypassLock`, `waitingParticipantAdmin` and `meetingEnd`, and grants every other permission

### Requirement: Permissions missing from older data
When a room member token, or a room or member stored before a permission existed, lacks that permission, Meet SHALL complete it as follows. A value present SHALL always win.
- `meetingRead` takes the value of `meetingJoin`.
- `participantMute`, `broadcastControl` and `broadcastEdit` are denied.
- `participantLowerHand`, `accessBypassLock` and `waitingParticipantAdmin` are denied in a token, and granted to the moderator role and to members with the moderator role.
- `participantSendReaction` is granted.

#### Scenario: Room from before 3.9.0
- **GIVEN** a room created before 3.9.0 with default roles
- **WHEN** the deployment is upgraded and a manager reads the room's roles
- **THEN** both roles grant `meetingRead` and `participantSendReaction` and deny `participantMute`
- **AND** only the moderator role grants `participantLowerHand`, `accessBypassLock` and `waitingParticipantAdmin`

#### Scenario: Room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role still grants `participantMute` and grants `participantLowerHand` and `participantSendReaction`, and the speaker role denies `participantLowerHand`
- **AND** both roles deny `broadcastControl` and `broadcastEdit`

#### Scenario: Locked room permissions of a room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role grants `accessBypassLock` and `waitingParticipantAdmin` and the speaker role denies both

#### Scenario: Moderator member from 3.9.0
- **GIVEN** a member stored by 3.9.0 with the moderator role and no override of the hand permission
- **WHEN** the deployment is upgraded to 3.10.0 and a manager reads the member
- **THEN** the member's effective permissions grant `participantLowerHand`

#### Scenario: Locked room permissions of a moderator member from 3.9.0
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

#### Scenario: Moderator token issued before the locked room
- **GIVEN** a moderator's room member token issued by 3.9.0
- **WHEN** its holder calls `waitingParticipantList` after the upgrade to 3.10.0
- **THEN** the token is read as denying `waitingParticipantAdmin` and the server answers `403`

### Requirement: Permissions without a deprecated name
`meetingRead`, `participantMute`, `participantLowerHand`, `participantSendReaction`, `broadcastControl`, `broadcastEdit`, `accessBypassLock` and `waitingParticipantAdmin` SHALL exist only under their current names: no deprecated key sets them, and no response adds a deprecated twin for them.

#### Scenario: Read back without a twin
- **WHEN** a manager reads a room's `roles`
- **THEN** each role carries `meetingRead`, `participantMute`, `participantLowerHand`, `participantSendReaction`, `broadcastControl`, `broadcastEdit`, `accessBypassLock` and `waitingParticipantAdmin` under those names only

#### Scenario: Deprecated join key leaves meetingRead alone
- **GIVEN** a speaker role that grants `meetingRead`
- **WHEN** a manager calls `updateRoomRoles` with `canJoinMeeting` `false` for the speaker role
- **THEN** the speaker role denies `meetingJoin` and still grants `meetingRead`
