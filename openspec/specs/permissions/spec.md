# Permissions Specification

## Purpose

Permissions are the flat boolean flags that decide what a participant, a user or an integrator may do in a room. Integrators set them through the room role sets and the member overrides, and every feature that gates an action names one of them.

Surfaces: the `MeetPermissions` schema (`meet-ce/backend/openapi/rooms/schemas/meet-permissions.yaml`) used by room `roles` (`createRoom`, `getRoom`, `updateRoomRoles`) and by room members (`customPermissions`, `effectivePermissions`); room member tokens; the room carried by the `meetingStarted` and `meetingEnded` webhooks; the typings TSDoc of `MeetRoomMemberPermissions` (`meet-ce/typings/src/database/room-member-permissions.ts`) and the `@permission` tag of each embedded command (`meet-ce/typings/src/embedded/commands.ts`). Documented in openvidu.io `docs/meet/features/rooms/access.md` (Predefined roles) and in the 3.9.0 Deprecated table of `CHANGELOG.md`.

## Requirements

### Requirement: Permission keys
Meet SHALL express what a principal may do in a room with exactly the twenty-two boolean permissions listed by the following requirements, each a flat key of every permission object: room role sets, member overrides and effective permissions, and room member tokens. A request SHALL fail with `422` when a permission carries a value that is not a boolean, and SHALL ignore any key that is not a permission.

#### Scenario: Unknown key ignored
- **WHEN** a manager calls `updateRoomMember` with `customPermissions` `{ "recordingControl": true, "canFly": true }`
- **THEN** the server answers `200`
- **AND** the member's `customPermissions` hold `recordingControl` (and its deprecated twin `canRecord`) and nothing about `canFly`

#### Scenario: Non-boolean value
- **WHEN** a manager calls `updateRoomRoles` giving `chatWrite` the value `"yes"`
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
- **WHEN** its holder calls `getRecordingMedia` and then `downloadRecording` for a recording of the room
- **THEN** the first answers `200` and the second `403`

### Requirement: Meeting permissions
Meet SHALL gate the meeting itself with three permissions:
- `meetingJoin`: obtain a token that joins the meeting, and stay in it (`meeting-join`, `room-members`).
- `meetingRead`: read the live meeting and its participants without joining (`meetingGet`, `participantList`, `participantGet`; `meetings`).
- `meetingEnd`: end the meeting for everyone (`meetings`).

#### Scenario: Observe without joining
- **GIVEN** a room member token granting `meetingRead` and denying `meetingJoin`, and a meeting running in the room
- **WHEN** its holder calls `meetingGet`
- **THEN** the server answers `200`
- **AND** a token request with `joinMeeting` for the same holder answers `403`

### Requirement: Participant permissions
Meet SHALL gate actions on participants with five permissions:
- `participantPromote`: promote or demote another participant (`meeting-moderation`).
- `participantKick`: remove another participant (`meeting-moderation`).
- `participantMute`: turn off another participant's microphone, camera or screen (`meeting-moderation`).
- `participantHandLower`: lower other participants' raised hands (`raise-hand`).
- `participantReactionSend`: send reactions (`reactions`).

#### Scenario: Kick without permission
- **GIVEN** a room member token obtained with the anonymous speaker link of a room with default roles
- **WHEN** its holder calls `participantKick`
- **THEN** the server answers `403`

### Requirement: Media permissions
Meet SHALL gate the participant's own media with four permissions, whose behavior `meeting-media` specifies:
- `mediaPublishAudio`: publish the microphone.
- `mediaPublishVideo`: publish the camera.
- `mediaShareScreen`: share the screen, with its audio.
- `mediaChangeVirtualBackground`: apply a virtual background.

#### Scenario: Camera not granted
- **GIVEN** a member whose effective permissions deny `mediaPublishVideo`
- **WHEN** they join the meeting
- **THEN** the meeting offers them no camera and the media server refuses a camera track from them

### Requirement: Chat and room permissions
Meet SHALL gate the chat and the room's access links with three permissions:
- `chatRead`: see the chat (`meeting-chat`).
- `chatWrite`: send chat messages (`meeting-chat`).
- `roomShareAccessLinks`: see and share the room's anonymous access links (`room-access`).

#### Scenario: Access links hidden
- **GIVEN** a room member token denying `roomShareAccessLinks`
- **WHEN** its holder calls `getRoom` for that room
- **THEN** the response carries no anonymous access URL

### Requirement: Moderator role defaults
A room created without permissions for its moderator role SHALL grant that role all twenty-two permissions. How the permissions given at creation combine with these defaults is specified in `room-access`.

#### Scenario: Default moderator
- **WHEN** a client creates a room without `roles`
- **THEN** the moderator role grants every permission, `broadcastControl` and `broadcastEdit` included

### Requirement: Speaker role defaults
A room created without permissions for its speaker role SHALL grant that role `recordingList`, `recordingPlay`, `recordingDownload`, `meetingJoin`, `meetingRead`, `participantReactionSend`, `mediaPublishAudio`, `mediaPublishVideo`, `mediaShareScreen`, `mediaChangeVirtualBackground`, `chatRead` and `chatWrite`, and deny the other ten.

#### Scenario: Default speaker
- **WHEN** a client creates a room without `roles`
- **THEN** the speaker role denies `recordingControl`, `recordingDelete`, `broadcastControl`, `broadcastEdit`, `roomShareAccessLinks`, `participantPromote`, `participantKick`, `participantMute`, `participantHandLower` and `meetingEnd`, and grants every other permission

### Requirement: Independent permissions
Meet SHALL never derive one permission from another: the value given to one permission SHALL never change another one, and every combination of values SHALL be valid, such as `meetingRead` without `meetingJoin` or `participantKick` without `participantMute`.

#### Scenario: Granting one moderation power
- **GIVEN** a room whose speaker role denies `participantKick` and `participantMute`
- **WHEN** a manager calls `updateRoomRoles` granting `participantKick` to the speaker role
- **THEN** the speaker role grants `participantKick` and still denies `participantMute`

#### Scenario: Join without reading
- **WHEN** a manager adds a member whose `customPermissions` grant `meetingJoin` and deny `meetingRead`
- **THEN** the server answers `201` and the member can join the meeting but `meetingGet` answers `403` to its token

### Requirement: Permissions missing from older data
When a room member token, or a room or member stored before a permission existed, lacks that permission, Meet SHALL complete it: `meetingRead` with the value of `meetingJoin`, `participantMute`, `participantHandLower`, `broadcastControl` and `broadcastEdit` denied, and `participantReactionSend` granted. A value present SHALL always win.

#### Scenario: Room from before 3.9.0
- **GIVEN** a room created before 3.9.0 with default roles
- **WHEN** the deployment is upgraded and a manager reads the room's roles
- **THEN** both roles grant `meetingRead` and `participantReactionSend` and deny `participantMute` and `participantHandLower`

#### Scenario: Room from 3.9.0
- **GIVEN** a room created by 3.9.0 with default roles
- **WHEN** the deployment is upgraded to 3.10.0
- **THEN** the moderator role still grants `participantMute`, denies `participantHandLower` and grants `participantReactionSend`
- **AND** both roles deny `broadcastControl` and `broadcastEdit`

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

### Requirement: Admins, the owner and the API key hold every permission
The server SHALL treat an admin, the room's owner and a request authenticated with the API key as holding every permission in the room, whatever the room's role sets say, both when it checks a request and in the room member tokens it issues to an admin or the owner.

#### Scenario: Owner beyond the moderator role
- **GIVEN** a room whose moderator role denies `recordingDelete`
- **WHEN** its owner deletes one of the room's recordings
- **THEN** the deletion succeeds

#### Scenario: Integrator with the API key
- **GIVEN** a room whose role sets deny `participantKick` to everyone
- **WHEN** an integrator calls `participantKick` with the API key
- **THEN** the participant is removed from the meeting

### Requirement: Permissions of the caller
For a request about a room, the server SHALL use the permissions carried by the room member token when one is presented, and none when that token belongs to another room; otherwise those of the user: every permission for an admin or the room's owner, the member's effective permissions for a member, the room's speaker role permissions under registered-user access (see `room-access`), and none otherwise.

#### Scenario: Token of another room
- **GIVEN** a moderator's room member token for room A
- **WHEN** its holder calls `meetingEnd` for room B
- **THEN** the server answers `403`

#### Scenario: Member using their account
- **GIVEN** a user member whose effective permissions deny `recordingDelete`
- **WHEN** they delete one of the room's recordings with their access token
- **THEN** the server answers `403`

### Requirement: Enforcement at the API
An operation gated by a permission SHALL answer `404` when the room does not exist, and otherwise `403` when the caller does not hold that permission, whatever the client offers.

#### Scenario: Speaker ends the meeting
- **GIVEN** a room member token obtained with the anonymous speaker link of a room with default roles
- **WHEN** its holder calls `meetingEnd`
- **THEN** the server answers `403` and the meeting goes on

#### Scenario: Room does not exist
- **WHEN** a client calls `meetingEnd` with a valid room member token for a room that does not exist
- **THEN** the server answers `404`

### Requirement: Enforcement in the media grant
A join token SHALL carry a media grant that allows publishing the microphone only with `mediaPublishAudio`, the camera only with `mediaPublishVideo`, the screen and its audio only with `mediaShareScreen`, and data messages such as chat only with `chatWrite`, so the media server itself refuses the rest; the grant SHALL always allow receiving the media of others and SHALL never let a participant change its own metadata.

#### Scenario: Chat write denied
- **GIVEN** a participant whose permissions deny `chatWrite`
- **WHEN** a modified client sends a chat message over the media connection
- **THEN** the media server refuses it and no participant receives it

#### Scenario: Screen share denied
- **GIVEN** a participant whose permissions deny `mediaShareScreen`
- **WHEN** their client tries to publish a screen track
- **THEN** the media server refuses it

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
- **AND** after the client reconnects with a fresh token obtained through `refreshRoomMemberToken`, the grant still denies the microphone

#### Scenario: Change handled by another replica
- **GIVEN** two Meet replicas and a speaker member in the meeting
- **WHEN** replica A promotes the speaker while replica B applies a permission update to the same member
- **THEN** the two changes apply one after the other and the live grant matches the member's new permissions merged with the moderator role

### Requirement: The meeting offers only permitted actions
The meeting SHALL offer an action only to a participant who holds the permission that gates it, and, for a feature the room config can turn off (see `room-config`), only while that feature is on; the actions offered SHALL follow the participant's permission changes without rejoining.

#### Scenario: Recording enabled but not permitted
- **GIVEN** a room with recording enabled and a participant whose permissions deny `recordingControl`
- **WHEN** they are in the meeting
- **THEN** the meeting shows them no control to start or stop recording

#### Scenario: Read-only chat
- **GIVEN** a room with chat enabled and a participant granted `chatRead` and denied `chatWrite`
- **WHEN** they open the chat
- **THEN** they see the messages and no input to write one

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
- **WHEN** a manager calls `updateRoomRoles` with `canRetrieveRecordings` `false` for the speaker role
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
- **GIVEN** a member's `customPermissions` as `getRoomMember` returned them, granting `recordingControl` and `canRecord`
- **WHEN** a client denies `recordingControl` in that object, leaves `canRecord` granted, and sends it to `updateRoomMember`
- **THEN** the server answers `422` and the member is unchanged

### Requirement: Served permission objects are accepted back
A permission object exactly as the server returned it SHALL be accepted unchanged in a request, with the current keys deciding the result.

#### Scenario: Echo of a split group
- **GIVEN** a speaker role read through `getRoom` that grants `recordingList` and `recordingDownload`, denies `recordingPlay`, and so carries `canRetrieveRecordings` `false`
- **WHEN** a manager sends those role permissions back unchanged through `updateRoomRoles`
- **THEN** the server answers `200` and the speaker role still grants `recordingList` and `recordingDownload` and denies `recordingPlay`

### Requirement: Both key sets on output
Until 3.12.0, every permission object the server returns or sends in a webhook (room `roles`, member `customPermissions` and `effectivePermissions`, and the room carried by `meetingStarted` and `meetingEnded`) SHALL carry the current keys and, next to them, the deprecated keys derived from them, without any `Deprecation` or `Sunset` header.

#### Scenario: Room roles read back
- **WHEN** a manager reads a room's `roles`
- **THEN** each role carries both `chatWrite` and `canWriteChat` with the same value, and likewise for every renamed key

#### Scenario: Webhook payload
- **WHEN** a meeting starts in a room
- **THEN** each role in the `roles` of the `meetingStarted` payload carries both key sets

### Requirement: The split flag on output
On output, `canRetrieveRecordings` SHALL be `true` only when `recordingList`, `recordingPlay` and `recordingDownload` are all granted, `false` when the three are present and one of them is denied, and absent when any of the three is absent from the object.

#### Scenario: Play only
- **GIVEN** a role that grants `recordingPlay` and denies `recordingList` and `recordingDownload`
- **WHEN** a manager reads it
- **THEN** it carries `canRetrieveRecordings` `false`

#### Scenario: Partial overrides
- **GIVEN** a member whose `customPermissions` hold only `recordingDownload`
- **WHEN** a manager reads the member
- **THEN** its `customPermissions` carry no `canRetrieveRecordings`

### Requirement: Permissions without a deprecated name
`meetingRead`, `participantMute`, `participantHandLower`, `participantReactionSend`, `broadcastControl` and `broadcastEdit` SHALL exist only under their current names: no deprecated key sets them, and no response adds a deprecated twin for them.

#### Scenario: Read back without a twin
- **WHEN** a manager reads a room's `roles`
- **THEN** each role carries `meetingRead`, `participantMute`, `participantHandLower`, `participantReactionSend`, `broadcastControl` and `broadcastEdit` under those names only

#### Scenario: Deprecated join key leaves meetingRead alone
- **GIVEN** a speaker role that grants `meetingRead`
- **WHEN** a manager calls `updateRoomRoles` with `canJoinMeeting` `false` for the speaker role
- **THEN** the speaker role denies `meetingJoin` and still grants `meetingRead`

### Requirement: Room member tokens with deprecated names
A room member token issued before 3.9.0, which carries its permissions under the deprecated names, SHALL be accepted until it expires and read under the current names, as requests are and completed as older data is; tokens issued now SHALL carry only the current names.

#### Scenario: Meeting in progress during the upgrade
- **GIVEN** a participant in a meeting holding a room member token issued by 3.8.0 with `canRetrieveRecordings` granted
- **WHEN** the deployment is upgraded and the participant lists the room's recordings with that token
- **THEN** the token is read as granting `recordingList`, `recordingPlay` and `recordingDownload` and the list is returned

### Requirement: Broadcast permissions
Meet SHALL gate live broadcasts with two permissions, whose behavior `live-broadcast` specifies:
- `broadcastControl`: start and stop the live broadcasts of the meeting to the room's destinations.
- `broadcastEdit`: stream the meeting to a destination the room does not have, which also needs `broadcastControl`.

#### Scenario: Room destinations only
- **GIVEN** a room member token granting `broadcastControl` and denying `broadcastEdit`
- **WHEN** its holder calls `broadcastStart` once with a room destination and once with a destination given by name and URL
- **THEN** the first answers `201` and the second `403`
