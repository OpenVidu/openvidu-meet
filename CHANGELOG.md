# Changelog

## 3.9.0 (unreleased)

3.9.0 opens the live meeting to the host application. A meeting can now be read, moderated and
ended over the REST API, participants arriving and leaving are reported as webhooks, the embedded
API can drive the local participant's microphone, camera and screen share, and a room can carry a
participant cap, a duration limit and automatic recording.

Adopting 3.9.0 requires no change to an existing integration. No endpoint, attribute, command or
event was removed. The permission, command and event names introduced here run alongside the
previous ones, which keep working until 3.12.0.

| Surface | Where it changed |
| --- | --- |
| REST API | [Meetings API](#meetings-api), [Webhooks API](#webhooks-api), [Recording download](#recording-download), [Deprecated](#deprecated) |
| Webhooks | [Webhooks API](#webhooks-api), [Participant events](#participant-events), [Meeting limits](#meeting-limits) |
| Embedded API | [Local media controls](#local-media-controls), [Participant identity](#participant-identity), [Initial media state](#initial-media-state), [Deprecated](#deprecated) |
| Room configuration | [Meeting limits](#meeting-limits), [Recording auto-start](#recording-auto-start), [Initial media state](#initial-media-state) |
| Meeting experience | [Meeting status rail](#meeting-status-rail), [Recording notices](#recording-notices), [Microphone warnings](#microphone-warnings), [Improved](#improved) |
| Console | [Console](#console) |
| Deployment | [Upgrade notes](#upgrade-notes) |

### Upgrade notes

- **`MEET_MODE` selects which permission keys the API accepts.** It defaults to `compatibility`,
  which accepts both the deprecated and the current keys, including a mix of the two in one
  request, and serves both key sets in responses and webhooks. No configuration change is required
  for this version. Setting it to `3.9.0` restricts acceptance to the current keys. It governs
  permission keys only, and does not affect the embedded API.
- **Compatibility mode rejects a partial rewrite of an alias pair.** A permission object read from
  the API carries both key sets, so writing it back after modifying only the deprecated half of a
  pair returns `422` naming the replacement key. Echoing the object back unchanged, or sending only
  the keys being changed, is accepted.

### Breaking changes

**None.** No endpoint, attribute, command or event was removed. Host application code written
against 3.8.0 keeps working, over both the web component and the iframe. A recording's `startDate`
is corrected in this version and is not sent while a recording has not started recording yet, which
is described under [Recordings](#recordings).

### Deprecated

The names below still work in this release and are removed in **3.12.0**. Responses that carry
deprecated permission keys also return the header `Deprecation: true`.

#### Permission keys

| Deprecated | Replacement |
| --- | --- |
| `canRecord` | `recordingControl` |
| `canRetrieveRecordings` | `recordingList`, `recordingPlay`, `recordingDownload` |
| `canDeleteRecordings` | `recordingDelete` |
| `canJoinMeeting` | `meetingJoin` |
| `canEndMeeting` | `meetingEnd` |
| `canMakeModerator` | `participantPromote` |
| `canKickParticipants` | `participantKick` |
| `canPublishAudio` | `mediaPublishAudio` |
| `canPublishVideo` | `mediaPublishVideo` |
| `canShareScreen` | `mediaShareScreen` |
| `canChangeVirtualBackground` | `mediaChangeVirtualBackground` |
| `canReadChat` | `chatRead` |
| `canWriteChat` | `chatWrite` |
| `canShareAccessLinks` | `roomShareAccessLinks` |

`canRetrieveRecordings` becomes three permissions, so that listing, playing and downloading a
recording can be granted separately.

#### Embedded commands and events

| Deprecated | Replacement | Kind |
| --- | --- | --- |
| `endMeeting` | `meetingEnd` | command |
| `leaveRoom` | `meetingLeave` | command |
| `kickParticipant` | `participantKick` | command |
| `joined` | `meetingJoined` | event |
| `left` | `meetingLeft` | event |
| `closed` | `meetingClosed` | event |

Both name sets are accepted regardless of `MEET_MODE`.

#### Moving to the current names

Responses and webhooks carry both permission key sets while `MEET_MODE` is `compatibility`, so
readers can move to the current names before writers do. Once no deprecated key is in use,
`MEET_MODE=3.9.0` makes the API reject them with a `422` that names the replacement.

### Added

#### Meetings API

**Surfaces:** REST API, permissions

An API under `/api/v1/meetings` for operating a live meeting from the host application:

| Endpoint | Permission |
| --- | --- |
| `GET /api/v1/meetings/{roomId}` | `meetingRead` |
| `DELETE /api/v1/meetings/{roomId}` | `meetingEnd` |
| `GET /api/v1/meetings/{roomId}/participants` | `meetingRead` |
| `GET /api/v1/meetings/{roomId}/participants/{participantIdentity}` | `meetingRead` |
| `DELETE /api/v1/meetings/{roomId}/participants/{participantIdentity}` | `participantKick` |
| `PUT /api/v1/meetings/{roomId}/participants/media` | `participantMute` |
| `PUT /api/v1/meetings/{roomId}/participants/{participantIdentity}/media` | `participantMute` |
| `PUT /api/v1/meetings/{roomId}/participants/{participantIdentity}/role` | `participantPromote` |

Every endpoint accepts both API keys and room member tokens. Reading a meeting or its participants
requires the new `meetingRead` permission and does not require the caller to have a seat in the
meeting. A permission set that does not name `meetingRead` takes it from `meetingJoin`, so existing
integrations keep the access they had.

A meeting reports `startDate`, `participantCount` and `recordingActive`, and, when the room sets
limits, the `endDate` it will be force-ended at and the `maxParticipants` in force. Both are
stamped when the meeting starts, so a change to the room configuration does not move them
mid-meeting.

#### Webhooks API

**Surfaces:** REST API

Webhooks are individually managed resources under `/api/v1/webhooks`, replacing the single global
webhook configuration:

| Endpoint | Operation |
| --- | --- |
| `POST /api/v1/webhooks` | Register a webhook |
| `GET /api/v1/webhooks` | List the registered webhooks |
| `GET /api/v1/webhooks/{webhookId}` | Read one webhook |
| `PUT /api/v1/webhooks/{webhookId}` | Update a webhook |
| `DELETE /api/v1/webhooks/{webhookId}` | Delete a webhook |
| `POST /api/v1/webhooks/{webhookId}/test` | Send a test delivery to its URL |

Each webhook defines its own event filter and room scope, so different systems can receive
different events. Managing them is a deployment-level operation rather than a room-level one:
these endpoints accept an API key or an administrator's access token, and no room permission grants
access to them.

#### Participant events

**Surfaces:** webhooks, embedded API

`participantJoined` and `participantLeft` are reported on two surfaces:

- As webhooks. `participantLeft` also carries `leaveDate`, `durationSeconds` and `leaveReason`.
- As embedded events, reporting remote participants. The local participant's own arrival and
  departure stay on `meetingJoined` and `meetingLeft`.

`leaveReason` describes how that participant's own session ended. A meeting ended for everyone is
reported as `meeting_ended`, whoever or whatever triggered it.

#### Meeting limits

**Surfaces:** room configuration, REST API, webhooks, embedded API, meeting UI, console

Two new room configuration fields:

- `config.maxParticipants`, from 1 to 30. Joins are rejected once the meeting is full, and the
  participant is told the meeting is full rather than shown a generic connection error.
- `config.maxDurationMinutes`, from 1 to 1440. The meeting is force-ended when it is reached.

The deadline is fixed when the meeting starts, so changing the room configuration does not move a
meeting that is already running. Participants see a countdown as the deadline approaches, and a
notice with a sound when the meeting is about to end.

An automatic end is reported on both integration surfaces, in each one's own vocabulary: the
`meetingEnded` webhook carries `reason: max_duration_reached`, and the embedded `meetingLeft` event
carries `reason: meeting_ended_by_duration_limit`.

#### Recording auto-start

**Surfaces:** room configuration, console

Recording can start on its own, through `config.recording.autoStart`:

- `when_first_participant_joins`
- `when_second_participant_joins`
- `when_moderator_joins`, which also triggers when a participant is promoted to moderator

Stopping the recording by hand disables auto-start for the rest of the meeting, so it does not
restart on the next join. A room that records automatically rejects an on-demand start, and a
threshold that the room's participant cap makes unreachable is rejected at configuration time.

#### Recording download

**Surfaces:** REST API, permissions

`GET /api/v1/recordings/{recordingId}/download`. Downloading a recording is permissioned separately
from playing it, through `recordingDownload` and `recordingPlay`.

#### Initial media state

**Surfaces:** room configuration, embedded API, console

`config.initialAudioActive` and `config.initialVideoActive` set the microphone and camera state a
participant joins with. Both default to `true`.

The embedding attributes `initial-audio-active` and `initial-video-active` override them for one
embed. A denied `mediaPublishAudio` or `mediaPublishVideo` permission always wins over both.

#### Local media controls

**Surfaces:** embedded API

Commands for the local participant's own media:

- `mediaToggleAudio`
- `mediaToggleVideo`
- `mediaToggleScreenShare`

Each one toggles when called with no argument and sets the state explicitly when given one, and
requires the matching `mediaPublish*` or `mediaShareScreen` permission. Audio and video can also be
set from the prejoin screen.

Every change, local or remote, is reported by a matching event carrying `{ active, origin }`:

- `mediaAudioStatusChanged`
- `mediaVideoStatusChanged`
- `mediaScreenShareStatusChanged`

`origin` says whether the participant themselves or a moderator caused the change.

#### Moderator media controls

**Surfaces:** REST API, embedded API, meeting UI

Moderators can mute a participant's microphone, camera or screen share, one participant at a time
or everyone at once, over the [meetings API](#meetings-api) or with the embedded commands
`participantMute(participantIdentity, media)` and `participantMuteAll(media)`.

They are gated on the new `participantMute` permission, configurable per role or per member and
disabled by default. A moderator cannot mute another moderator, and a participant can always turn
their own device back on. A remote mute reaches the affected participant as the media status event
for that device, carrying `origin: 'moderator'`.

#### Participant identity

**Surfaces:** embedded API, REST API, webhooks

The embedding attributes `participant-external-id` and `participant-metadata` associate a meeting
participant with a user in the host application. They travel as `externalId` and `metadata` in
participant payloads, on both the meetings API and the participant webhooks. `metadata` is capped
at 2 KB, measured in UTF-8 bytes.

Participant identity is fixed by the join token. A participant can no longer rewrite their own
identity from the client.

#### Meeting status rail

**Surfaces:** meeting UI

Meeting-wide status is gathered into one rail above the layout, so it stays visible even when the
host application renders no toolbar. It shows a recording chip, which reports that a recording is
starting and then how long it has been running, a countdown when the meeting is about to reach its
duration limit, an indicator when the meeting is end-to-end encrypted, and the number of hidden
participants. A chip that opens a panel does so only when the viewer is allowed to open that panel.

#### Recording notices

**Surfaces:** meeting UI

The meeting itself says when a recording starts and when it stops, instead of only the panel that
has to be opened to be read. A recording that cannot start because nobody in the room is publishing
anything is announced too, saying it will begin as soon as a participant turns on their microphone
or camera; that one stays until it is closed, because the room is what ends the wait.

#### Microphone warnings

**Surfaces:** meeting UI

A participant who speaks while muted is told, and so is one whose microphone has been muted by the
operating system rather than by Meet.

#### Console

**Surfaces:** console

- The room wizard configures the meeting limits and the initial microphone and camera state.
- Room ids can be copied from the rooms list and from the room detail page.
- Webhooks are managed as individual resources, over the [webhooks API](#webhooks-api).

### Improved

- **Participants panel.** It shows the microphone, camera and screen share state of every
  participant, and offers per-device mute controls next to **Promote** and **Kick**.
- **Joining a meeting** asks for the camera and the microphone in a single browser permission
  prompt instead of two.
- **The floating or docked choice for the local video tile** is remembered per browser.
- **Screen shares can be zoomed with two fingers** on touch devices. The zoom used to live in a
  hover overlay that a finger never reaches.
- **The web component loader** imports the bundle lazily, so the entry script stays small and the
  bundle is cached on its own.
- **Rate limits** for token issuance, API requests and static assets were raised to accommodate
  large audiences.
- **Meetings render more cheaply.** Layout work no longer runs while nothing has moved, microphone
  level metering runs on a timer instead of every frame, speaking detection is off the main thread,
  and MediaPipe and the virtual background processors load only when used.

### Fixed

#### Security

- A participant could grant themselves moderator permissions by modifying their own role and
  identity data. Roles and permissions are decided by the server alone.
- The `chatWrite` permission was enforced in the interface only. It is enforced at the media server,
  through the data publish grant, both at join time and when permissions change mid-meeting.
- Two object merge helpers accepted prototype-chain keys, and temporary passwords were generated
  from a non-cryptographic random source.
- Changing a member's media permissions mid-meeting did not reach the media server, so a revoked
  permission left the participant able to keep publishing.

#### Meetings and rooms

- Ended meetings could stay marked as running, which blocked duration limits and room configuration
  changes from taking effect. Meeting state is reconciled and closed automatically.
- A stale reconnect could reopen a closed room.
- A meeting that filled up while a participant was joining reported a generic connection error
  instead of saying the meeting was full.
- Transferring room ownership while deleting a user could lose the transfer to a race.
- The local video disappeared from the layout when the last remote participant left.
- A participant who joined with a device turned off could not turn it on.

#### Recordings

- **A recording's `startDate` was the moment the recording was requested, not the moment it started
  recording media.** Every recording reported a start earlier than its own first frame, so its
  duration never matched the distance between its start and its end, and the elapsed time shown
  during the meeting ran ahead of the recording; one that waited for a participant to publish
  reported a start minutes early. `startDate` is now that first frame, and is no longer sent while
  a recording has not reached it: a recording in the `starting` status, and one that ended without
  recording anything (`failed` and `aborted` statuses), carry no `startDate` where they used to
  carry that inaccurate value. This reaches `GET /recordings`, `GET /recordings/{recordingId}` and
  the `recordingStarted`, `recordingUpdated` and `recordingEnded` webhooks, so code that reads
  `startDate` must tolerate its absence, and code that sorts by it should expect those recordings
  grouped apart from the rest. `POST /recordings` and `POST /recordings/{recordingId}/stop` answer
  with a recording that is already recording, so their responses still carry it. Recordings made
  before this version keep the value they were stored with.
- Stopping a recording could race a concurrent stop, and a recording that was starting or ending
  was not counted as in progress when the lock was released.
- The auto-start latch outlived its own meeting.
- Deleting a recording could fail on an error payload with missing fields.

#### Embedding

- Re-entering a meeting in the same web component instance wiped or froze the entry attributes.
- The web component could not find its bundle when the host application served the loader from its
  own origin.

#### Room wizard

- Abandoned wizard state leaked into the next room, and a failed save reset the form.
- The wizard sent back the deprecated permission keys it had read.