## MODIFIED Requirements

### Requirement: Media permissions
Meet SHALL gate the participant's own media with four permissions, whose behavior `meeting-media` specifies:
- `mediaPublishAudio`: publish the microphone.
- `mediaPublishVideo`: publish the camera.
- `mediaShareScreen`: share the screen, with its audio.
- `mediaChangeVirtualBackground`: apply a virtual background, which also needs `mediaPublishVideo`.

#### Scenario: Camera not granted
- **GIVEN** a member whose effective permissions deny `mediaPublishVideo`
- **WHEN** they join the meeting
- **THEN** the meeting offers them no camera and the media server refuses a camera track from them

#### Scenario: Virtual background without the camera
- **GIVEN** a member whose effective permissions grant `mediaChangeVirtualBackground` and deny `mediaPublishVideo`
- **WHEN** they join the meeting
- **THEN** the meeting offers them no background effects

### Requirement: Chat and room permissions
Meet SHALL gate the chat and the room's access links with three permissions:
- `chatRead`: see the chat (`meeting-chat`).
- `chatWrite`: send chat messages (`meeting-chat`), which also needs `chatRead`.
- `roomShareAccessLinks`: see and share the room's anonymous access links (`room-access`).

#### Scenario: Access links hidden
- **GIVEN** a room member token denying `roomShareAccessLinks`
- **WHEN** its holder calls `getRoom` for that room
- **THEN** the response carries no anonymous access URL

#### Scenario: Writing without reading
- **GIVEN** a member whose effective permissions grant `chatWrite` and deny `chatRead`
- **WHEN** they join a meeting with chat enabled
- **THEN** they can neither see nor send chat messages
