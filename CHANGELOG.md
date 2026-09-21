# Changelog

Every release groups its `Added`, `Improved` and `Fixed` entries by who the change reaches:

- **Integration**: the REST API, the webhooks and the embedded API, the surfaces a host
  application is built against.
- **UI**: the meeting and the console, what a person using Meet sees.
- **Deployment**: configuration, limits and running the server.

## 3.9.0 (unreleased)

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

| Deprecated        | Replacement       | Kind    |
| ----------------- | ----------------- | ------- |
| `endMeeting`      | `meetingEnd`      | command |
| `leaveRoom`       | `meetingLeave`    | command |
| `kickParticipant` | `participantKick` | command |
| `joined`          | `meetingJoined`   | event   |
| `left`            | `meetingLeft`     | event   |
| `closed`          | `meetingClosed`   | event   |

Both command and event name sets are accepted.

### Added

#### Integration

- [Meetings API][3.9-meetings] under `/api/v1/meetings`: read a live meeting, end it, list and read its
  participants, and kick or promote them. It accepts API keys and room member tokens, and reading uses the new
  [`meetingRead`][3.9-permissions] permission.
- A member with the new [`participantMute`][3.9-permissions] permission, disabled by default, can mute a
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

- A status rail above the meeting layout (recording, duration countdown, encryption, hidden participants),
  and notices when a recording starts and stops.
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
- Meeting layout improvements.
- Device permissions are requested in a single prompt.
- The floating or docked choice for the local video tile is remembered per browser.

#### Deployment

- Rate limits for token issuance, API requests and static assets were raised.
- `MEET_INITIAL_ADMIN_USER`, `MEET_INITIAL_API_KEY` and `MEET_INITIAL_WEBHOOK_URL` seed their item on every start while the deployment has none, instead of on the first start only.

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
- A virtual background or blur froze for other participants when the sending window was minimized or covered, in Firefox and Safari.
- Abandoned wizard state leaked into the next room, and a failed save reset the form.
- A camera or microphone the system had not finished releasing failed to start, with a generic dialog or no message at all, and a failed device switch left the camera dead. The device is asked for again, a failed switch keeps the current device, and a notice names the device that could not be started.

#### Deployment

- Unanswered webhooks caused active connections to grow continuously. Every webhook is answered.

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
[3.9-stop-recording]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/stopRecording
