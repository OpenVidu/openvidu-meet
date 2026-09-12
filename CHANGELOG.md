# Changelog

Every release groups its `Added`, `Improved` and `Fixed` entries by who the change reaches:

- **Integration**: the REST API, the webhooks and the embedded API, the surfaces a host
  application is built against.
- **UI**: the meeting and the console, what a person using Meet sees.
- **Deployment**: configuration, limits and running the server.

## 3.9.0 (unreleased)

The permission, command and event names introduced in this release run alongside the previous
ones, which keep working until 3.12.0. Endpoints, payloads and webhook events are documented in
the [REST API reference][3.9-api].

### Upgrade notes

- `MEET_MODE` selects which permission keys the API accepts. It defaults to `compatibility`, which
  accepts and serves both key sets; `MEET_MODE=3.9.0` accepts only the current ones. It does not
  affect the embedded API.
- A permission object read from the API carries both key sets. Writing it back after changing only
  the deprecated half of an alias pair returns `422`. The unchanged object, or one carrying only
  the changed keys, is accepted.

### Breaking changes

**None.** No endpoint, attribute, command or event was removed.

### Deprecated

The names below still work in this release and are removed in **3.12.0**. Responses that carry
deprecated permission keys also return the header `Deprecation: true`, and carry both key sets
while `MEET_MODE` is `compatibility`.

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

Both command and event name sets are accepted regardless of `MEET_MODE`.

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

- The web component loader imports the bundle lazily.

#### UI

- Joining a meeting asks for the camera and the microphone in a single browser permission prompt.
- The floating or docked choice for the local video tile is remembered per browser.
- Meeting layout improvements.
- Screen shares can be zoomed with two fingers on touch devices.

#### Deployment

- Rate limits for token issuance, API requests and static assets were raised.

### Fixed

#### Integration

- A participant could grant themselves moderator permissions by modifying their own role and identity data.
  Roles and permissions are decided by the server alone.
- `chatWrite` was enforced in the interface only. It is enforced at the media server, at join time and when
  permissions change mid-meeting.
- Revoking a member's media permissions mid-meeting did not reach the media server, so the participant kept
  publishing.
- Ended meetings could stay marked as running, which blocked duration limits and room configuration changes
  from taking effect.
- A stale reconnect could reopen a closed room.
- Transferring room ownership while deleting a user could lose the transfer to a race.
- A recording's [`startDate`][3.9-recording] was the moment the recording was requested, not the moment it
  started recording media. It is the first recorded frame, and is absent from a recording that never reached
  one.
- [`POST /recordings`][3.9-start-recording] waited for the recording to become active and answered `503` after
  20 seconds otherwise, cancelling a recording that was only waiting for somebody to publish. It answers `201`
  as soon as the media server accepts the recording.
- [`POST /recordings/{recordingId}/stop`][3.9-stop-recording] answered `409` for a recording that was still
  starting, while cancelling it anyway. It answers `202`, and the recording ends `aborted` without a file.
- Stopping a recording could race a concurrent stop, and a recording that was starting or ending was not
  counted as in progress when the lock was released.
- The per-room recording lock was released while a recording waited for its first track, which allowed a
  second recording to be started on the same room.
- The auto-start latch outlived its own meeting.
- Deleting a recording could fail on an error payload with missing fields.
- Re-entering a meeting in the same web component instance wiped or froze the entry attributes.
- The web component could not find its bundle when the host application served the loader from its own origin.

#### UI

- A meeting that filled up while a participant was joining reported a generic connection error.
- The local video disappeared from the layout when the last remote participant left.
- A participant who joined with a device turned off could not turn it on.
- The stop control in the toolbar and in the recording panel was disabled until a recording was active.
- Abandoned wizard state leaked into the next room, and a failed save reset the form.
- The wizard sent back the deprecated permission keys it had read.

#### Deployment

- A LiveKit webhook for a room Meet does not own was never answered, so its connection, file descriptor
  and memory were held for good. A deployment driving LiveKit directly grew without bound with Meet
  unused. Every webhook is answered.
- Two object merge helpers accepted prototype-chain keys, and temporary passwords were generated from a
  non-cryptographic random source.

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
[3.9-start-recording]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/startRecording
[3.9-stop-recording]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/stopRecording
