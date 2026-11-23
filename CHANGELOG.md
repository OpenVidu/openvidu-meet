# Changelog

Every release groups its `Added`, `Improved` and `Fixed` entries by who the change reaches:

- **Integration**: the REST API, the webhooks and the embedded API, the surfaces a host
  application is built against.
- **UI**: the meeting and the console, what a person using Meet sees.
- **Deployment**: configuration, limits and running the server.

## 3.10.0 (unreleased)

This release adds live broadcasts, locked rooms with a waiting room, raise hand and reactions, and moves the meeting's
moderation, recording and role commands to the embedded API.

### Upgrade notes

- Meet does not start when `MEET_INITIAL_ADMIN_USER` or `MEET_INITIAL_ADMIN_PASSWORD` is shorter than 5 characters, or
  when `MEET_BLOB_STORAGE_MODE` is not `s3`, `gcs` or `abs` (3.9 took any other value as `s3`).
- Identified guest **access links** created before this release **are insecure and must be regenerated** via the console, or by deleting and re-adding the guest. The old link will stop working once regenerated.
  This process will be performed automatically starting with version 3.13.0.

### Breaking changes

**None.**

### Added

#### Integration

- **Live broadcasting:** Added support for streaming meetings to one or more RTMP destinations. Includes the new `broadcastControl` and `broadcastEdit` permissions. See the [Broadcasts API documentation][3.10-broadcasts].
- **Locked rooms:** Added support for restricting room access and managing participants through a waiting room. Configured via `access.lock`. See the [Room Access documentation][3.10-room-access].
- **Raise hand:** Added support for participants to raise and lower their hands through the API and embedded commands.
- **Reactions:** Added support for participants to send reactions during meetings.
- **Participant roles:** Added the `participantUpdateRole` command to promote or demote participants. See the [Participant Role documentation][3.10-participant-role-changed].
- **Recording controls:** Added embedded commands to start and stop recordings.
- **Language settings:** Added the `language` and `show-language-selector` embedded attributes.
- **Meeting information:** Extended `meetingGet` to include participant and waiting room information. User responses now include `isRootAdmin`.

#### UI

- **Live broadcasting:** Added broadcast configuration to the room wizard and live broadcast indicators during meetings.
- **Locked rooms:** Added waiting room screens and participant management indicators, along with room access configuration in the room wizard.
- **Participant interactions:** Added raise hand and reactions to the meeting interface.
- **Device setup:** Improved the device setup screen with microphone level indicators and separate controls for camera, microphone and background effects.
- **Room members:** Added a Regenerate link action to the Room Members tab that gives an identified guest a link of the current form, keeping their `memberId`.

#### Deployment

- **Live broadcasting:** Requires OpenVidu Egress to be enabled.
- **Azure Blob Storage:** Added support for managed identity authentication, allowing deployments to authenticate without configuring an account key.

### Improved

#### Integration

- **Participant information:** Extended participant-related APIs and events with additional information, including the participant `type` and the `leaveReason` attribute. See the [Participant API documentation][3.10-participant-list].
- **Permission dependencies:** Improved permission validation to ensure that related permissions, such as `chatRead` and `chatWrite`, are used consistently.
- **Recording management:** Enhanced `recordingList` to support filtering by multiple statuses. See the [Recording API documentation][3.10-recording-list].

#### UI

- **Meeting settings:** Reorganized settings into three tabs (Audio & video, Layout and General), with previews for camera and microphone changes.
- **Audio quality:** Improved microphone audio quality and screen-sharing audio capture.
- **Console lists:** Improved list navigation and usability, including key figures, persistent search and filters, URL-based state and more responsive loading.
- **Console overview:** Added room and recording statistics grouped by status, with automatic refresh.

### Fixed

#### Integration

- **Access security:** Fixed several issues affecting room access, guest links and authentication. Room member tokens are now invalidated when access rights or roles change, guest access links use independent secrets, and user tokens are revoked after logout or password changes.
- **API authorization:** Fixed access control issues affecting room and recording links, chat functionality and participant information. Sensitive resources and operations are now properly protected by server-side permission checks.
- **Room and participant management:** Fixed issues with room status changes, member permissions, moderation requests and participant removal during meetings.
- **Recording management:** Fixed issues affecting recording lifecycle events, playback and downloads, including failed recording processes and large or cancelled ZIP downloads. Improved access restrictions and bulk operation handling.
- **Meeting lifecycle and events:** Fixed inconsistencies in meeting and participant events, including incorrect timestamps and leave reasons, as well as duplicate events caused by concurrent operations.
- **API consistency:** Fixed incorrect HTTP status codes, access-related error responses, pagination filters and scope handling. Bulk recording operations are now limited to 100 items.
- **Embedded integration:** Fixed event listener registration, iframe communication, command handling, redirection and isolation issues in the `<openvidu-meet>` component.
- **Captions and encryption:** Fixed an issue that allowed live captions to be enabled in rooms using end-to-end encryption.
- **Configuration and validation:** Fixed issues with recording-only mode and invalid participant data.

#### UI

- **Meeting state:** Fixed issues where recording indicators, chat messages and room information could carry over between meetings in the same tab or embedded component.
- **Participant management:** Fixed issues with role and permission updates, participant reconnections and system notifications.
- **Meeting controls:** Fixed issues affecting microphone and recording controls, fullscreen menus and chat interactions.
- **Responsive layout:** Fixed toolbar, status rail and notification overflow issues on narrow screens and mobile devices.
- **Chat and captions:** Fixed issues with links, message sending and caption display when multiple speakers are present. Also prevented participants from impersonating system messages.
- **Recording permissions:** Fixed an issue that exposed playback and sharing actions to users without the required permissions.
- **Console:** Fixed issues with administrator protection, navigation, overview error handling, translations and API key information.

#### Deployment

- **Proxy configuration:** Fixed an issue where certain IPv4-mapped IPv6 subnet configurations could cause untrusted clients to be treated as trusted proxies.
- **Request handling:** Fixed a server stability issue caused by malformed compressed request bodies.
- **Azure storage:** Fixed playback, download and deletion of recordings stored in Azure Blob Storage, including recordings stored in subdirectories.
- **URL configuration:** Fixed access URL generation when using custom ports or base paths through `MEET_BASE_URL` and `MEET_BASE_PATH`.

## 3.9.0

This release deprecates the old permissions, commands and events, and adds a new set of them. The new and old names run alongside each other for compatibility **until 3.12.0**, when the old names are removed.

### Breaking changes

**None.**

### Deprecated

The names below still work in this release and are removed in **3.12.0**. Requests accept either
key set, and responses and webhooks carry both.

| Deprecated permission        | Replacement                                           |
| ---------------------------- | ----------------------------------------------------- |
| `canRecord`                  | `recordingControl`                                    |
| `canRetrieveRecordings`      | `recordingList`, `recordingPlay`, `recordingDownload` |
| `canDeleteRecordings`        | `recordingDelete`                                     |
| `canJoinMeeting`             | `meetingJoin`                                         |
| `canEndMeeting`              | `meetingEnd`                                          |
| `canMakeModerator`           | `participantPromote`                                  |
| `canKickParticipants`        | `participantKick`                                     |
| `canPublishAudio`            | `mediaPublishAudio`                                   |
| `canPublishVideo`            | `mediaPublishVideo`                                   |
| `canShareScreen`             | `mediaShareScreen`                                    |
| `canChangeVirtualBackground` | `mediaChangeVirtualBackground`                        |
| `canReadChat`                | `chatRead`                                            |
| `canWriteChat`               | `chatWrite`                                           |
| `canShareAccessLinks`        | `roomShareAccessLinks`                                |

| Deprecated        | Replacement              | Kind    |
| ----------------- | ------------------------ | ------- |
| `endMeeting`      | `meetingEnd`             | command |
| `leaveRoom`       | `meetingLeave`           | command |
| `kickParticipant` | `participantKick`        | command |
| `joined`          | `meetingJoined`          | event   |
| `left`            | `meetingLeft`            | event   |
| `closed`          | `embeddedCloseRequested` | event   |

Both command name sets are accepted. Every event is emitted under both names, so a listener
registered on both receives it twice.

### Added

#### Integration

- [Meetings API][3.9-meetings] under `/api/v1/meetings`: read a live meeting, end it, list and read its
  participants, and kick or promote them. It accepts API keys and room member tokens, and reading uses the new
  [`meetingRead`][3.9-permissions] permission.
- A member with the new [`participantMute`][3.9-permissions] permission, granted to the moderator role of
  rooms created from this release on (speakers need it granted explicitly), can mute a
  participant's microphone, camera or screen share, one at a time or everyone at once, over the meetings API
  ([`participantMute`][3.9-participant-mute], [`participantMuteAll`][3.9-participant-mute-all]) or with the
  embedded commands of the same names. A moderator cannot be muted, and muting everyone leaves the caller
  alone.
- Embedded commands `mediaToggleAudio`, `mediaToggleVideo` and `mediaToggleScreenShare` for the local
  participant's own media, reported by `mediaAudioStatusChanged`, `mediaVideoStatusChanged` and
  `mediaScreenShareStatusChanged`, carrying `{ active, origin }`.
- Participants arriving and leaving are reported as the webhooks [`participantJoined`][3.9-participant-joined]
  and [`participantLeft`][3.9-participant-left], the second carrying `leaveDate`, `durationSeconds` and
  `leaveReason`, and as embedded events of the same names for remote participants.
- Embedded attributes `participant-external-id` and `participant-metadata`, travelling as `externalId` and
  `metadata` in participant payloads.
- [Webhooks API][3.9-webhooks-api] under `/api/v1/webhooks`, replacing the single global webhook
  configuration. Each webhook carries its own event filter and room scope, and is managed with an API key or
  an administrator's token.
- [`GET /api/v1/recordings/{recordingId}/download`][3.9-download], permissioned through `recordingDownload`
  separately from `recordingPlay`.
- [Room configuration][3.9-room-config] `config.maxParticipants` (1 to 30) and `config.maxDurationMinutes` (1
  to 1440). Reaching the duration limit ends the meeting with `reason: max_duration_reached` on the
  [`meetingEnded`][3.9-meeting-ended] webhook and `reason: meeting_ended_by_duration_limit` on the embedded
  `meetingLeft` event.
- [Room configuration][3.9-room-config] `config.recording.autoStart`, at `when_first_participant_joins`,
  `when_second_participant_joins` or `when_moderator_joins`.
- [Room configuration][3.9-room-config] `config.initialAudioActive` and `config.initialVideoActive`,
  overridden per embed by the attributes `initial-audio-active` and `initial-video-active`.

#### UI

- A status rail above the meeting layout (elapsed meeting time, recording, duration countdown, encryption,
  hidden participants), and notices when a recording starts and stops.
- A participant who speaks while muted is told, and so is one whose microphone the operating system has
  muted rather than Meet.
- Media controls in the participants panel: the microphone, camera and screen share state of every
  participant, and per-device mute controls next to **Promote** and **Kick**.
- The meeting limits and the initial media state in the room wizard, and copyable room ids.

### Improved

#### Integration

- REST API requests validate through precompiled schemas, reducing response times.

#### UI

- Screen shares can be zoomed with two fingers on touch devices.
- Meeting layout performance improvements.
- Device permissions are requested in a single prompt.
- The floating or docked choice for the local video tile is remembered per browser.

#### Deployment

- Rate limits for token issuance, API requests and static assets were raised.
- `MEET_INITIAL_ADMIN_USER`, `MEET_INITIAL_API_KEY` and `MEET_INITIAL_WEBHOOK_URL` seed their item on every start while the deployment has none, instead of on the first start only.
- The `openvidu/openvidu-meet` Docker image is 41% smaller and no longer contains pnpm, bash or `meet.sh`.

### Fixed

#### Integration

- A participant could grant themselves moderator permissions by modifying their own role and identity data. Roles and permissions are decided by the server alone.
- `chatWrite` permission was enforced in the interface only. It is enforced at the media server, at join time and when permissions change mid-meeting.
- Revoking a member's media permissions mid-meeting did not reach the media server, so the participant kept publishing.
- Ended meetings could stay marked as running, which blocked duration limits and room configuration changes from taking effect.
- A stale reconnect could reopen a closed room.
- A recording's [`startDate`][3.9-recording] was the moment the recording was requested, not the moment it started recording media.
- [`POST /recordings`][3.9-start-recording] waited 20 seconds until the meeting has participants publishing media. Now there is no timeout.
- Deleting a recording could fail on an error payload with missing fields.
- Re-entering a meeting in the same web component instance wiped or froze the entry attributes.
- A room's `autoDeletionDate` could be set so far in the future that it was never honored, leaving the room stuck forever. It now has an upper limit.
- `DELETE /rooms` reset the connection instead of answering when `roomIds` grew large enough to exceed the runtime's header size limit. Now roomIds are limited to 100
- [`POST /rooms`][3.9-create-room] failed when `roomName` was empty. Now, default value `Room` is used when `roomName` is empty, blank or `null`.

#### UI

- The local video disappeared from the layout when the last remote participant left.
- The first meeting a browser opened saved its layout and number of visible participants as the participant's choice. They are saved only when the participant changes them in the settings panel.
- A virtual background or blur froze for other participants when the sending window was minimized or covered, in Firefox and Safari.
- Abandoned wizard state leaked into the next room, and a failed save reset the form.

#### Deployment

- Unanswered webhooks caused active connections to grow continuously. Every webhook is answered.
- The `openvidu/openvidu-meet` Docker image resolved its dependencies anew on every build instead of installing the versions in the lockfile. It now installs the locked versions.

[3.10-participant-list]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/participantList
[3.10-participant-role-changed]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/webhooks/participantRoleChangedWebhook
[3.9-api]: https://openvidu.io/3.9/meet/embedded/reference/api.html
[3.9-meetings]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/meetingGet
[3.9-webhooks-api]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/webhookList
[3.9-participant-joined]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/participantJoinedWebhook
[3.9-participant-left]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/participantLeftWebhook
[3.9-meeting-ended]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/meetingEndedWebhook
[3.9-participant-mute]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/participantMute
[3.9-participant-mute-all]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/participantMuteAll
[3.9-download]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/downloadRecording
[3.9-room-config]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/schemas/MeetRoomConfig
[3.9-permissions]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/schemas/MeetPermissions
[3.9-recording]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/schemas/MeetRecording
[3.9-create-room]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/createRoom
[3.9-start-recording]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/startRecording
[3.9-recording-ended]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/recordingEndedWebhook
[3.10-broadcasts]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/broadcastStart
[3.10-permissions]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/schemas/MeetPermissions
[3.10-room-config]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/schemas/MeetRoomConfig
[3.10-room-access]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/schemas/MeetRoomAccess
[3.10-meetings]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/meetingGet
[3.10-waiting-participant-list]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/waitingParticipantList
[3.10-recording-bulk-delete]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/recordingBulkDelete
[3.10-recording-bulk-download]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/recordingBulkDownload
[3.10-recording-get-url]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/recordingGetUrl
[3.10-recording-list]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/recordingList
[3.10-room-get]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/roomGet
[3.10-room-list]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/roomList
[3.10-room-update-status]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/roomUpdateStatus
[3.10-user-list]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/userList
