# Changelog

## 3.9.0 (Unreleased)

### Breaking Changes

#### Permission, command, and event naming

Permission keys, embedded commands, and events now follow a consistent naming scheme with the module name first.

The previous names remain supported but are deprecated and will be removed in **3.12.0**.

##### Permission keys

| Deprecated                   | Current                                               |
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

`canRetrieveRecordings` is split into separate permissions for listing, playing, and downloading recordings.

##### Embedded commands

| Deprecated        | Current           |
| ----------------- | ----------------- |
| `endMeeting`      | `meetingEnd`      |
| `leaveRoom`       | `meetingLeave`    |
| `kickParticipant` | `participantKick` |

##### Embedded events

| Deprecated | Current         |
| ---------- | --------------- |
| `joined`   | `meetingJoined` |
| `left`     | `meetingLeft`   |
| `closed`   | `meetingClosed` |

##### Compatibility mode

The `MEET_MODE` environment variable controls which permission names are accepted:

* `compatibility` (default): accepts old and new permission keys, including mixed usage. Responses and webhooks include both key sets and return `Deprecation: true`.
* `3.9.0`: accepts only the new permission keys. Deprecated keys return `422` with the replacement key.

`MEET_MODE` only affects permission keys and does not change the embedded API.

---

### Added

#### Meeting limits

Added configurable participant and duration limits:

* `config.maxParticipants`: maximum number of participants. New joins are rejected once the limit is reached.
* `config.maxDurationMinutes`: maximum meeting duration. The meeting ends automatically when the limit is reached, with a warning shown beforehand.

An automatic end is reported on both integration surfaces: the `meetingEnded` webhook carries `reason: max_duration_reached`, and the embedded `meetingLeft` event carries `reason: meeting_ended_by_duration_limit`.

#### Recording auto-start

Added automatic recording based on meeting state:

* `when_first_participant_joins`
* `when_second_participant_joins`
* `when_moderator_joins`

`when_moderator_joins` also triggers when a participant is promoted to moderator.

Manually stopping the recording disables auto-start for the remainder of the meeting.

#### Initial media state

Added room-level defaults for microphone and camera state:

* `initialAudioActive`
* `initialVideoActive`

Both default to `true`.

Added embedding attributes to override the room defaults:

* `initial-audio-active`
* `initial-video-active`

Explicitly denied `mediaPublish*` permissions always take precedence.

#### Moderator media controls

Added the ability for moderators to mute a participant's microphone, camera, or screen share.

**Permissions**

* Added `participantMute`, configurable per role or member.
* Disabled by default.

**REST API**

* `PUT /meetings/{roomId}/participants/{participantIdentity}/media`
* `PUT /meetings/{roomId}/participants/media`

**Embedded API**

* `participantMute(participantIdentity, media)`
* `participantMuteAll(media)`

Both commands require `participantMute`.

Moderators cannot mute other moderators. Participant mutes are always reversible by the participant.

**Events**

The following events now include `origin: 'moderator'` when applicable:

* `mediaAudioStatusChanged`
* `mediaVideoStatusChanged`
* `mediaScreenShareStatusChanged`


#### Embedding API: media controls

Added commands for controlling local media:

* `mediaToggleAudio`
* `mediaToggleVideo`
* `mediaToggleScreenShare`

Commands can toggle or explicitly set the media state and require the corresponding permission. Audio and video controls are also available from the prejoin screen.

Added media state events:

* `mediaAudioStatusChanged`
* `mediaVideoStatusChanged`
* `mediaScreenShareStatusChanged`

Events include `{ active, origin }`.

Added participant lifecycle events:

* `participantJoined`
* `participantLeft`

These events are emitted for remote participants.

#### Embedding API: participant correlation

Added embedding attributes for associating meeting participants with users in the host application:

* `participant-external-id`
* `participant-metadata`

#### Webhooks

Replaced the single global webhook configuration with individually managed webhook resources.

**Webhook management**

* `POST /webhooks`
* `GET /webhooks`
* `PUT /webhooks/{webhookId}`
* `DELETE /webhooks/{webhookId}`
* `POST /webhooks/{webhookId}/test`

Each webhook can define its own event filter and room scope.

**Participant events**

Added:

* `participantJoined`
* `participantLeft`

Participant payloads include `externalId` and `metadata`.

`participantLeft` also includes:

* `leaveDate`
* `durationSeconds`
* `leaveReason`

`leaveReason` describes how that participant's own session ended. A meeting ended for everyone is reported as `meeting_ended`, whoever or whatever triggered it.

**Meeting events**

The `meetingEnded` webhook now includes an optional `reason`, set only when the meeting was force-ended. Automatic duration-limit termination reports `max_duration_reached`.

#### REST API

**Meetings**

Added a public meetings API under `/api/v1/meetings` for operating a live meeting from the host application:

| Endpoint                                                          | Permission           |
| ----------------------------------------------------------------- | -------------------- |
| `GET /meetings/{roomId}`                                          | `meetingRead`        |
| `DELETE /meetings/{roomId}`                                       | `meetingEnd`         |
| `GET /meetings/{roomId}/participants`                             | `meetingRead`        |
| `GET /meetings/{roomId}/participants/{participantIdentity}`       | `meetingRead`        |
| `DELETE /meetings/{roomId}/participants/{participantIdentity}`    | `participantKick`    |
| `PUT /meetings/{roomId}/participants/media`                       | `participantMute`    |
| `PUT /meetings/{roomId}/participants/{participantIdentity}/media` | `participantMute`    |
| `PUT /meetings/{roomId}/participants/{participantIdentity}/role`  | `participantPromote` |

Every endpoint accepts both API keys and room member tokens. Reading a meeting or its participants requires the new `meetingRead` permission and does not require the caller to have a seat in the meeting. A permission set that does not name `meetingRead` takes it from `meetingJoin`, so existing integrations keep the access they had.

**Recordings**

Added `GET /recordings/{recordingId}/download`. Recording download is now independently permissioned from playback.

---

### Improved

#### Participants panel

The participants panel now:

* Displays microphone, camera, and screen-share state for each participant.
* Provides per-device moderator mute controls alongside **Promote** and **Kick**.

#### Meeting join

Camera and microphone permissions are now requested in a single browser permission prompt.

#### Participant tile layout

The floating/docked participant tile preference is now persisted per browser.

---

### Fixed

#### Security

Fixed an issue that allowed a participant to grant themselves moderator permissions by modifying their own role and identity data.

Moderator permissions are now controlled exclusively by the server.

#### Meeting state

Fixed an issue where ended meetings could remain marked as running.

Meeting state is now reconciled and closed automatically, allowing duration limits and room configuration changes to work correctly.

#### Closed rooms

Fixed an issue where an old reconnect could reopen a closed room.

Closed rooms now remain closed.

#### Room wizard

Fixed an issue where:

* Abandoned wizard state could leak into the next room.
* Failed saves reset the entered form data.
