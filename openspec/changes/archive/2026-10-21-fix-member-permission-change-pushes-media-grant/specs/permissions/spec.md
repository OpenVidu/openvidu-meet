## MODIFIED Requirements

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
