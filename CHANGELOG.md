# Changelog

## 3.9.0 (Unreleased)

### Breaking Changes

Permission keys, embedded commands and events now share one naming scheme
(module name first). Old names still work but are deprecated, and will be
removed in `3.12.0`.

#### `MEET_MODE`: which set of names the API speaks

Set via the `MEET_MODE` environment variable at boot. Affects only permission
keys, not the embedding API.

- **`compatibility`** (default): accepts old and new `can*` keys, or a mix.
  Responses and webhooks carry both key sets, plus a `Deprecation: true`
  header.
- **`3.9.0`**: new keys only. A deprecated key gets a `422` naming its
  replacement.

#### Permission keys renamed

All 14 `can*` flags are renamed. `canRetrieveRecordings` splits into three
keys, so watching and downloading a recording can be granted separately:

| Deprecated key               | Current key(s)                                        |
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

#### Embedded commands and events renamed

| Deprecated command | Current command   |
| ------------------ | ----------------- |
| `endMeeting`       | `meetingEnd`      |
| `leaveRoom`        | `meetingLeave`    |
| `kickParticipant`  | `participantKick` |

| Deprecated event | Current event   |
| ---------------- | --------------- |
| `joined`         | `meetingJoined` |
| `left`           | `meetingLeft`   |
| `closed`         | `meetingClosed` |

### Added

#### Meeting limits

Rooms can now cap meeting size and length:

- `config.maxParticipants`: caps participants; further joins are rejected once
  full.
- `config.maxDurationMinutes`: caps duration; the meeting ends automatically,
  with a warning a few minutes ahead.

#### Recording auto-start

Rooms can now start recording automatically.

- `config.recording.autoStart` accepts three modes:
    - `when_first_participant_joins`
    - `when_second_participant_joins`: lets a host set up alone before it
      starts
    - `when_moderator_joins`: also fires on promotion, not only on join

> Manually stopping the recording disarms auto-start for the rest of the
  meeting.

#### Initial media state

- `initialAudioActive` / `initialVideoActive` room settings: default
  mic/camera state on join (default: **on**).
- `initial-audio-active` / `initial-video-active` embed attributes: override
  per embed, falling back to the room setting when absent.

> Denied `mediaPublish*` permissions always take precedence.

#### Moderator media controls

A moderator can now turn off another participant's microphone, camera or
screen share:

- New `participantMute` permission, editable per role or member, off by
  default.
- New REST endpoints: `PUT /meetings/{roomId}/participants/{participantIdentity}/media`
  and its bulk twin `PUT /meetings/{roomId}/participants/media`. Mute only,
  never a moderator, always reversible by the participant.
- New embedded commands `participantMute(participantIdentity, media)` and
  `participantMuteAll(media)`, gated on `participantMute`.
- The muted participant sees their device switch off, with a notice that a
  moderator did it.
- `mediaAudioStatusChanged` / `mediaVideoStatusChanged` /
  `mediaScreenShareStatusChanged` carry `origin: 'moderator'` when applicable.
- New per-device mute buttons in the participants panel, next to
  promote/kick.

#### Embedding API: media controls

- Commands `mediaToggleAudio`, `mediaToggleVideo`, `mediaToggleScreenShare`:
  toggle or set explicitly, gated on the matching permission; audio/video also
  work from the prejoin screen.
- Events `mediaAudioStatusChanged`, `mediaVideoStatusChanged`,
  `mediaScreenShareStatusChanged` (`{ active, origin }`) for the local
  participant's own changes.
- Events **`participantJoined`** / **`participantLeft`** for remote participants.

#### Embedding API: participant correlation

New **`participant-external-id`** and **`participant-metadata`** attributes,
to correlate a participant with the host application's own user.

#### Webhooks

Webhooks move from a single global URL to a full resource:

- New CRUD endpoints: `POST/GET/PUT/DELETE /webhooks`,
  `POST /webhooks/{webhookId}/test`. Each webhook has its own event-type
  filter and room scope.
- New **`participantJoined`** / **`participantLeft`** webhooks, with the
  participant's identity (`externalId`/`metadata`); `participantLeft` adds
  `leaveDate`, `durationSeconds`, `leaveReason`.
- **`meetingEnded`** adds an optional `cause` (`max_duration_reached` on an
  automatic end, absent otherwise).

#### REST API

- New live meeting introspection endpoints: `GET /meetings/{roomId}`,
  `GET /meetings/{roomId}/participants`,
  `GET /meetings/{roomId}/participants/{participantIdentity}`, gated on a new
  `meetingRead` permission, independent from having a seat in the room.
- New `GET /recordings/{recordingId}/download`, separate from playback (see
  the recording permission split above).

### Improved

#### REST API

The meetings group (read, roster, end, kick, change role) is now public,
under `/api/v1/meetings`, and accepts an API key as well as a room member
token.

#### Meeting experience

- The participants panel now shows each participant's microphone, camera and
  screen-share state, with mute controls right there.
- Joining now asks for camera and microphone permission in a single prompt.
- Room wizard steps reordered; **Room Features** renamed **Meeting Features**,
  now also covering the meeting limits.
- A participant's floating/docked choice for their own tile is now remembered
  per browser.

### Fixed

#### Security

- **A participant could grant themselves moderator permissions**, by editing
  their own role and identity data directly. Now server-controlled only.

#### Rooms and meetings

- **A meeting could stay marked as running after it had ended**, blocking its
  duration limit and configuration edits. Now reconciled and closed
  automatically; a duration-limit end now shows correctly, not as a
  moderator's.
- **A closed room could reopen on its own**, through an old reconnect. Closed
  rooms now stay closed.

#### Console and room wizard

- An abandoned wizard no longer leaks its choices into the next room. A
  failed save keeps what was typed instead of resetting the form.

