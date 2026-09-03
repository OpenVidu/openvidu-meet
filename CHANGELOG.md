# Changelog

## 3.9.0 (Unreleased)

### Breaking Changes

Permission keys, embedded commands and events now follow one consistent scheme
across the whole API (module name first). The old names still work (they are
accepted and emitted), but they are deprecated and will be removed in `3.12.0`.

#### `MEET_MODE`: which set of names the API speaks

Set with the `MEET_MODE` environment variable at boot, for the whole
deployment. An unrecognized value stops the server. It affects only the
permission keys, not the embedding API.

- **`compatibility`** (the default): requests accept the old `can*` keys, the
  new ones, or a mix. Responses and webhooks carry **both** key sets, plus a
  `Deprecation: true` header, so integrations can migrate endpoint by endpoint.
- **`3.9.0`**: only the new keys. A request using a deprecated one gets a `422`
  naming its replacement, so an integration can be checked against the final
  contract before the old names disappear.

#### Permission keys renamed

All 14 `can*` flags are renamed. `canRetrieveRecordings` becomes three separate
keys, so a room can let people watch a recording without letting them download
it:

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

Rooms can now cap the size and length of their meetings:

- `config.maxParticipants` sets a maximum number of participants: once a
  meeting is full, anyone else who tries to join will be rejected.
- `config.maxDurationMinutes` sets a maximum duration: the meeting ends
  automatically once it has run that long, with every participant warned a
  few minutes ahead.

#### Recording auto-start

Rooms can now start recording automatically.

- `config.recording.autoStart` accepts three modes:
    - `when_first_participant_joins`
    - `when_second_participant_joins` (lets a host
      join alone to set up screen share or layout before the recording starts)
    - `when_moderator_joins`

- `when_moderator_joins` also fires when someone already in the meeting is
  promoted to moderator, not only when a moderator arrives from outside.
- A deliberate stop through the REST API or the console disarms auto-start for
  the rest of the meeting, so the recording does not restart the next time
  someone joins.
- A trigger that could never fire is refused when the room is saved: asking for
  `when_second_participant_joins` in a room capped at one participant is a 422
  instead of a recording that silently never starts.

#### Initial media state

Whether a participant's camera and microphone start on or off is now a single,
predictable decision instead of four different mechanisms fighting each other:

- A new room config, `initialAudioActive` / `initialVideoActive`, sets the
  room-wide default for whether participants join with audio/video on
  (default: on).
- New embedding attributes **`initial-audio-active`** /
  **`initial-video-active`** decide the same thing per embed. Where set, the
  attribute overrides the room's default in either direction; where absent, the
  room decides. A denying `mediaPublish*` permission always wins over both.

#### Moderator media controls

A moderator can now turn off another participant's microphone, camera or screen
share:

- New `participantMute` permission, editable per role or member like every
  other permission and off by default, and with no deprecated `can*` spelling
  since it postdates the permission rename. It is independent of
  `participantKick`, so a deployment can grant the ability to remove someone from
  a meeting without also granting the ability to silence them, or vice versa.
- New REST endpoints, `PUT /meetings/{roomId}/participants/{participantIdentity}/media`
  and its bulk twin `PUT /meetings/{roomId}/participants/media` (mutes everyone
  except moderators and the caller). The request only accepts `false`: this
  mutes, it never remotely turns a device on, the muted participant can turn it
  back on themselves, and it never applies to a moderator.
- New embedded commands `participantMute(participantIdentity, media)` and
  `participantMuteAll(media)`, gated on the `participantMute` permission.
- The muted participant is told what happened: their device is switched off
  locally and a notice says a moderator turned it off, so a device going dead
  mid-sentence is never unexplained.
- Their own `mediaAudioStatusChanged` / `mediaVideoStatusChanged` /
  `mediaScreenShareStatusChanged` events carry `origin: 'moderator'` when
  someone else made the change, so an embedding host (or the participant's own
  toolbar) can tell "I did this" apart from "a moderator did this to me".
- The participants panel gains per-device mute buttons next to promote/kick,
  shown only while a device is on and only to someone holding the permission.

#### Embedding API: media controls

- Commands `mediaToggleAudio`, `mediaToggleVideo` and `mediaToggleScreenShare`:
  call with no argument to toggle, or a boolean to set the device explicitly.
  Each is gated on the corresponding `mediaPublish*` / `mediaShareScreen`
  permission, and the two device toggles also work from the prejoin screen,
  before the meeting connects.
- Events `mediaAudioStatusChanged`, `mediaVideoStatusChanged` and
  `mediaScreenShareStatusChanged`, each carrying `{ active, origin }`, fired for
  the local participant's own media changes, including ones made from the
  prejoin screen.
- Events **`participantJoined`** and **`participantLeft`**, fired for remote
  participants joining or leaving the meeting.

#### Embedding API: participant correlation

New **`participant-external-id`** and **`participant-metadata`** attributes, so
a host application can correlate a meeting participant with one of its own
users. Both travel in the participant's token metadata (not in the LiveKit
identity string, which stays server-generated) and are echoed back by the
participant lifecycle events and webhooks. Bounded at 64 characters and 2048
UTF-8 bytes respectively; the second limit is on encoded bytes, so multi-byte
characters count for more than one.

#### Webhooks

Webhooks move from a single global URL to a full resource:

- New CRUD endpoints, `POST/GET/PUT/DELETE /webhooks` plus
  `POST /webhooks/{webhookId}/test`. Each webhook can narrow its delivery with
  an event-type filter and a per-room scope, and can be enabled, tested, edited
  and deleted independently.
- New **`participantJoined`** and **`participantLeft`** webhooks, delivered with
  the participant's identity (including `externalId`/`metadata`) but no live
  media state, since lifecycle events fire before tracks are published or after
  they are torn down. `participantLeft` also carries `leaveDate`,
  `durationSeconds` and `leaveReason`, so a receiver can audit or bill a session
  without having had to record the join itself.
- **`meetingEnded`** carries an optional `cause`, present only when the server
  force-ended the meeting (today `max_duration_reached`) and absent for a normal
  end, so a receiver can tell an enforced end from a moderator's.

#### REST API

- New endpoints for live meeting introspection: `GET /meetings/{roomId}` and its
  participants sub-resources (`GET /meetings/{roomId}/participants`,
  `GET /meetings/{roomId}/participants/{participantIdentity}`), gated on a new
  `meetingRead` permission so a dashboard or receptionist view can be granted
  without also granting a seat in the room. Being newer than the permission
  rename, `meetingRead` has no deprecated `can*` spelling: a complete request
  that cannot name it yet inherits the value of `meetingJoin`, which is what
  gated these reads before the permission existed.
- New `GET /recordings/{recordingId}/download`, serving the download separately
  from playback so the two can be granted apart (see the recording permission
  split under **Breaking Changes**).

### Improved

#### Embedding API

Every command now declares the meeting phase it is valid in, and both
transports enforce that single declaration, instead of the iframe bridge
applying a blanket gate of its own on top. A signal-level reconnect no longer
refuses commands that worked a moment earlier.

#### Initial media state is no longer persisted

Closing and reopening a meeting always re-resolves it from the room and the
current embedding attribute, instead of carrying over whatever was toggled last
time.

#### REST API

The whole meetings group (reading a meeting and its roster, ending it, kicking
a participant, changing a participant's role) moves from the internal-only
surface to the public API under `/api/v1/meetings`, and now accepts an API key
next to a room member token, so an integrator's backend can drive meeting
moderation directly instead of only from a browser session.

#### Console

The Embedded page manages the webhook collection directly, replacing the old
single-URL configuration screen. An existing configured URL is migrated
automatically into the collection as its first entry on upgrade.

#### Meeting experience

- The participants panel is rebuilt around device state: each row shows whether
  that participant's microphone, camera and screen share are on, so a moderator
  can see who is muted without reading the tiles, and the new mute controls sit
  where that state is already visible.
- Joining now asks for the camera and the microphone in **one** browser
  permission prompt instead of two. Only if that combined request fails (a
  camera held by another application would otherwise take the microphone down
  with it) are the devices requested one at a time.
- The room wizard's steps are reordered, and **Room Features** is renamed
  **Meeting Features**: the step that now also carries the meeting limits.
- Speaking indicators no longer animate on the main thread, the microphone level
  is sampled on a timer rather than on every animation frame, and the layout
  stops recalculating while nothing has moved.
- A participant's floating/docked choice for their own tile is now remembered
  per browser. Once someone docks their tile back into the participants grid,
  it stays docked by default on future meetings instead of floating again as
  soon as another participant joins; it floats again only if they explicitly
  choose to.

### Fixed

#### Security

- **A participant could rewrite their own identity.** The LiveKit grant that let
  a client update its own participant metadata is withheld. That metadata is
  what the server reads back as the participant's role, `externalId` and
  application metadata, so a speaker could set their own badge to moderator and
  have the token-refresh path sign those forged permissions into a fresh token.
  Promotion state is now written only by the server, at join time or through
  the promote/demote call, so every reader, the participant webhooks and the
  introspection endpoints included, sees a value the client cannot forge. One
  side effect if you drive the meeting with a raw `livekit-client`: without that
  grant, a participant's own `setMetadata()`, `setName()` and `setAttributes()`
  calls are refused instead of quietly taking effect.

#### Rooms and meetings

- **Meetings left running.** A `room_started` webhook that never arrived, or
  that another Meet deployment sharing the LiveKit instance consumed, left the
  room marked open in the database, invisible to the duration sweep and to the
  config lock for as long as the meeting lasted. Open rooms are now reconciled
  against LiveKit's live ones. A single Redis error no longer cancels the
  scheduled cleanups for the rest of the process's life, and a meeting
  force-ended by its duration limit is attributed to the limit everywhere
  instead of looking like a moderator ended it.
- **A closed room could reopen itself.** A LiveKit reconnect carrying a token
  minted before the room was closed made LiveKit auto-create it again, and Meet
  marked it active, putting a room an operator had deliberately closed back into
  service. The room now stays closed and the LiveKit room that reconnect
  resurrected is deleted.


#### Webhooks

- Delivery fans out as wide as the endpoint cap, so one slow endpoint no longer
  holds up the healthy ones; registration is serialized, closing a race that let
  the maximum be exceeded; the timeout value is back in the error message that
  had lost it; and the event envelope's discriminator names a property that
  actually exists.

#### Embedding API

- **Re-entering a meeting in the webcomponent** wiped or froze the attributes of
  the new entry. The internal router resets its state on remount, so a second
  visit behaves like the first.
- A media toggle command given a non-boolean `active` treats it as absent (a
  plain toggle) instead of coercing it into a value the caller never asked for.

#### Console and room wizard

- An abandoned wizard session no longer leaks its choices into the next room
  created, and a rejected save keeps what was typed instead of resetting the
  form and navigating away.

