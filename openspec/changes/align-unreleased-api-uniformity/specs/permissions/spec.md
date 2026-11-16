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
- **WHEN** a manager calls `roomUpdateRoles` with `canJoinMeeting` `false` for the speaker role
- **THEN** the speaker role denies `meetingJoin` and still grants `meetingRead`

### Requirement: Permission keys

Meet SHALL express what a principal may do in a room with exactly the twenty-four boolean permissions listed by the following requirements, each a flat key of every permission object: room role sets, member overrides and effective permissions, and room member tokens. A request SHALL fail with `422` when a permission carries a value that is not a boolean, and SHALL ignore any key that is not a permission.

#### Scenario: Unknown key ignored

- **WHEN** a manager calls `roomUpdateMember` with `customPermissions` `{ "recordingControl": true, "canFly": true }`
- **THEN** the server answers `200`
- **AND** the member's `customPermissions` hold `recordingControl` (and its deprecated twin `canRecord`) and nothing about `canFly`

#### Scenario: Non-boolean value

- **WHEN** a manager calls `roomUpdateRoles` giving `chatWrite` the value `"yes"`
- **THEN** the server answers `422` and the roles are unchanged

### Requirement: Recording permissions

Meet SHALL gate recordings with five permissions, whose behavior `recordings` specifies:

- `recordingControl`: start and stop recording the meeting.
- `recordingList`: list the room's recordings.
- `recordingPlay`: get a recording, play it back and get its shareable URL.
- `recordingDownload`: download a recording, alone or in a ZIP of several.
- `recordingDelete`: delete recordings, one by one or in bulk.

#### Scenario: Play without download

- **GIVEN** a room member token granting `recordingPlay` and denying `recordingDownload`
- **WHEN** its holder calls `recordingGetMedia` and then `recordingDownload` for a recording of the room
- **THEN** the first answers `200` and the second `403`

### Requirement: Chat and room permissions

Meet SHALL gate the chat and the room's access links with three permissions:

- `chatRead`: see the chat (`meeting-chat`).
- `chatWrite`: send chat messages (`meeting-chat`), which also needs `chatRead`.
- `roomShareAccessLinks`: see and share the room's anonymous access links (`room-access`).

#### Scenario: Access links hidden

- **GIVEN** a room member token denying `roomShareAccessLinks`
- **WHEN** its holder calls `roomGet` for that room
- **THEN** the response carries no anonymous access URL

#### Scenario: Writing without reading

- **GIVEN** a member whose effective permissions grant `chatWrite` and deny `chatRead`
- **WHEN** they join a meeting with chat enabled
- **THEN** they can neither see nor send chat messages

### Requirement: Independent permissions

Meet SHALL never derive one permission from another: the value given to one permission SHALL never change another one, and every combination of values SHALL be valid, such as `meetingRead` without `meetingJoin` or `participantKick` without `participantMute`.

#### Scenario: Granting one moderation power

- **GIVEN** a room whose speaker role denies `participantKick` and `participantMute`
- **WHEN** a manager calls `roomUpdateRoles` granting `participantKick` to the speaker role
- **THEN** the speaker role grants `participantKick` and still denies `participantMute`

#### Scenario: Join without reading

- **WHEN** a manager adds a member whose `customPermissions` grant `meetingJoin` and deny `meetingRead`
- **THEN** the server answers `201` and the member can join the meeting but `meetingGet` answers `403` to its token

### Requirement: The media grant follows permission changes

When a participant's permissions change during the meeting, through a room member update, a promotion or a demotion (see `room-members` and `meeting-moderation`), the server SHALL apply the new media grant to their live connection at once, without a reconnection and without waiting for their client to renew its token, and a later renewal or reconnection SHALL keep it.

#### Scenario: Camera revoked mid-meeting

- **GIVEN** a member publishing their camera in the meeting
- **WHEN** a manager denies the member `mediaPublishVideo`
- **THEN** the participant's live grant no longer allows the camera and their camera is no longer published, without them leaving the meeting

#### Scenario: Chat write granted back

- **GIVEN** a member in the meeting whose `chatWrite` was denied
- **WHEN** a manager grants it again
- **THEN** the participant can send chat messages without rejoining

#### Scenario: Client that ignores the renewal request

- **GIVEN** a member publishing their microphone with a client that never renews its token
- **WHEN** a manager denies the member `mediaPublishAudio`
- **THEN** the media server stops accepting their microphone
- **AND** after the client reconnects with a fresh token obtained through `roomRefreshMemberToken`, the grant still denies the microphone

#### Scenario: Change handled by another replica

- **GIVEN** two Meet replicas and a speaker member in the meeting
- **WHEN** replica A promotes the speaker while replica B applies a permission update to the same member
- **THEN** the two changes apply one after the other and the live grant matches the member's new permissions merged with the moderator role

### Requirement: Deprecated permission names on input

Until 3.12.0 the server SHALL accept, in every permission object of a request, the fourteen deprecated `can*` permission keys of 3.8.0, alone or mixed with the current keys, applying each one to the key it was renamed to, and `canRetrieveRecordings` to `recordingList`, `recordingPlay` and `recordingDownload` together.

#### Scenario: Renamed keys

- **WHEN** a request carries deprecated permission keys
- **THEN** `canRecord` sets `recordingControl`
- **AND** `canDeleteRecordings` sets `recordingDelete`
- **AND** `canJoinMeeting` sets `meetingJoin`
- **AND** `canEndMeeting` sets `meetingEnd`
- **AND** `canMakeModerator` sets `participantPromote`
- **AND** `canKickParticipants` sets `participantKick`
- **AND** `canPublishAudio` sets `mediaPublishAudio`
- **AND** `canPublishVideo` sets `mediaPublishVideo`
- **AND** `canShareScreen` sets `mediaShareScreen`
- **AND** `canChangeVirtualBackground` sets `mediaChangeVirtualBackground`
- **AND** `canReadChat` sets `chatRead`
- **AND** `canWriteChat` sets `chatWrite`
- **AND** `canShareAccessLinks` sets `roomShareAccessLinks`

#### Scenario: Split recording flag

- **WHEN** a manager calls `roomUpdateRoles` with `canRetrieveRecordings` `false` for the speaker role
- **THEN** the speaker role denies `recordingList`, `recordingPlay` and `recordingDownload`

#### Scenario: Consistent mix

- **WHEN** a request carries `canRecord` `true`, `recordingControl` `true` and `chatWrite` `false`
- **THEN** the server accepts it and stores `recordingControl` granted and `chatWrite` denied

### Requirement: Contradicting spellings

A request SHALL fail with `422`, changing nothing, when a deprecated key and one of its replacements carry different values, except a `canRetrieveRecordings` equal to the AND of its three replacements, all present in the request; the error details SHALL name both the deprecated key and its replacement.

#### Scenario: Contradicting rename

- **WHEN** a request carries `canRecord` `true` and `recordingControl` `false`
- **THEN** the server answers `422` with details naming `canRecord` and `recordingControl`

#### Scenario: Contradicting split flag

- **WHEN** a request carries `canRetrieveRecordings` `true` and `recordingDownload` `false`
- **THEN** the server answers `422`

#### Scenario: One spelling edited

- **GIVEN** a member's `customPermissions` as `roomGetMember` returned them, granting `recordingControl` and `canRecord`
- **WHEN** a client denies `recordingControl` in that object, leaves `canRecord` granted, and sends it to `roomUpdateMember`
- **THEN** the server answers `422` and the member is unchanged

### Requirement: Served permission objects are accepted back

A permission object exactly as the server returned it SHALL be accepted unchanged in a request, with the current keys deciding the result.

#### Scenario: Echo of a split group

- **GIVEN** a speaker role read through `roomGet` that grants `recordingList` and `recordingDownload`, denies `recordingPlay`, and so carries `canRetrieveRecordings` `false`
- **WHEN** a manager sends those role permissions back unchanged through `roomUpdateRoles`
- **THEN** the server answers `200` and the speaker role still grants `recordingList` and `recordingDownload` and denies `recordingPlay`

### Requirement: An earlier join token does not restore revoked access

A participant who connects to the meeting with a join token issued before a change that revoked it (a demotion, a member update, a role change of the user, the deletion of the member) SHALL be removed from the meeting, and the grant and metadata of that earlier token SHALL NOT be used to renew the participant's token or to authorize any action. A participant who reconnects with the credentials of their own current session SHALL stay in the meeting.

#### Scenario: Demoted moderator reconnects with the promotion token

- **GIVEN** a speaker promoted to moderator during the meeting and then demoted
- **WHEN** their client disconnects and connects again with the token it held while promoted
- **THEN** that session is removed from the meeting
- **AND** `roomRefreshMemberToken` never issues a token carrying the moderator permissions

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
