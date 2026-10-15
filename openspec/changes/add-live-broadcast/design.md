## Context

Meet already records meetings with LiveKit's room-composite egress, writing a file. The same egress
can write RTMP streams instead, and LiveKit's `UpdateStream` adds and removes stream URLs on a running
egress. Three facts of LiveKit shape the design (probed against the local deployment):

- A stream has no identifier. LiveKit reports each stream by its URL with the key redacted
  (`{abc...xyz}`, ends of at most three characters), lists streams in no stable order, and some
  platforms rewrite the URL they report (Twitch).
- An egress appends each added stream to its `streamResults` and never reorders or removes them in the
  responses to `StartRoomCompositeEgress` and `UpdateStream`; `ListEgress` lags while new streams
  connect.
- LiveKit never reports an egress whose egress service died: it stays `EGRESS_ACTIVE` forever. The
  only signal is the egress participant leaving the room (`participant_left` of kind `EGRESS`, whose
  identity is the egress id) about 20 seconds after the death.
- The egress marks a stream as receiving media when the RTMP client creates a stream with its stream
  key, and gives the time to the first stream of that key still waiting, so two streams with the same
  key can swap. It also holds back every update while any stream is still connecting.

See proposal.md for the motivation and the specs for the behavior.

## Goals / Non-Goals

**Goals:**

- Each destination is its own broadcast, so one destination failing or stopping never touches the
  others.
- A stream key is never served nor logged; only the server holds full destination URLs.
- Every behavior holds with several replicas, and a lost egress or a lost webhook never leaves a room
  unable to go live.

**Non-Goals:**

- Changing the layout or encoding for one meeting, or a room destination from inside a meeting.
- Starting a broadcast automatically when a meeting starts.
- Keeping a history of broadcasts: a broadcast leaves no artifact, so it is served only while it is in
  progress, as a sub-resource of the meeting (`/meetings/{roomId}/broadcasts`), not as a top-level
  `/broadcasts` resource like recordings.
- Recording and broadcasting from the same egress.
- Reporting a destination that is reconnecting: it stays `active` while the egress retries it.
  LiveKit reports the retries at most once a minute; exposing them is left for later.

## Decisions

### One egress per meeting, one stream per broadcast

The first broadcast of a meeting starts a room-composite egress with a single RTMP URL; each later one
joins it through `UpdateStream` with one URL. The meeting is composed and encoded once and sent to
every destination. One egress per destination was rejected: it composes and encodes the meeting once
per destination. An earlier single broadcast with a list of destinations was replaced because a
destination had no lifecycle of its own (stop, retry, status, webhooks) and a failing one failed the
whole broadcast. The layout and encoding of the room config apply to the egress; a broadcast that
joins a running egress reports the egress's own.

### A broadcast knows its stream by position

Each URL is added in a call of its own, so the stream of a new broadcast is the last entry of the
`streamResults` that call returns; the broadcast record keeps that `streamIndex` and reads its
stream's status, dates and error from that position in every later egress snapshot. Matching the
redacted URL LiveKit reports was rejected (two keys with the same ends collide, Twitch rewrites the
URL), and so was reading the position from `ListEgress` (it lags). If LiveKit ships stream
identifiers (livekit/egress#1423), only this lookup changes.

### State in Redis under a per-room lock

The broadcasts in progress of a room live in one Redis value, `ov_meet:broadcast:<roomId>`: the list
of records with the full URL, egress id and stream index, deleted when the last one ends. It has no
TTL: a meeting without a duration limit streams for as long as it lasts, and a record that expired
would make the next event of its egress look like one no broadcast references, which gets stopped.
The meeting's end forgets it instead, through `room_finished` or, when that event is lost, through
the meeting reconciliation, which runs the same cleanup. Every change, from a request or from a LiveKit webhook on any replica, runs
under the Redis lock `ov_meet_lock:broadcast_<roomId>`. A request waits up to 10 s for it and then
answers `409`; a webhook waits up to the lock's 30 s TTL, since it carries LiveKit's latest snapshot
that nothing else would apply. A MongoDB collection like the recordings one was rejected: there is
nothing to list once the meeting ends.

### Full URLs stay out of the domain

The room document stores the full URL of each saved destination in `broadcastDestinationUrls`, keyed
by destination id, outside the `MeetRoom` shape; the config and every response carry the URL with its
last non-empty path segment replaced by `********` and no query string. A config update resolves each
sent destination against those URLs: an `id` with the redacted URL exactly as served keeps the saved
one, a full URL replaces it, anything else is `422`. A destination given for one meeting is kept
only in the Redis record, so only the browser that added it knows its full URL and can start it again.
The creation log redacts the room options.

### One stream key per meeting

Since the egress tells the streams of a meeting apart by their stream key when they connect, a room's
destinations and the broadcasts in progress of a meeting never share one, whatever their hosts: the
duplicate checks compare stream keys (what follows the last `/`, without ` live=1`), not whole URLs.
Two streams with one key would let a destination take the other's start, and one left waiting would
hold back every later update of the meeting's broadcasts.

### Start all or nothing, stop at once

A start request adds its URLs one by one and, when one fails, removes the ones it added before
answering the error, the failing one included: a call that times out may still have been taken. A stop removes the broadcast's URL with `UpdateStream`, which ends a stream that
is not the egress's last one synchronously; the last one makes the egress end itself. The answer of
LiveKit settles the final state, so `broadcastStop` answers `200` with it, unlike `stopRecording`'s
`202`.

### Notify from the saved change

Every saved change sends the data-channel signal `meet_broadcast_updated` to the meeting and the
matching webhook: started for a new record, ended for a finished one, updated otherwise, and nothing
when the record did not change (LiveKit repeats every change a request already applied). A joining
participant gets one signal per broadcast in progress, sent to them alone on `participant_joined`. The
browser turns the first signal of each broadcast into `broadcastStarted`, so a late joiner sees the
same events as everyone else. Signals are relayed from the server, never trusted from a participant.

### Lost egresses and lost webhooks

When an egress participant leaves while its broadcasts or its recording are still in progress, the
server probes it with an empty `UpdateStream`: only a dead egress service answers `503` ("no response
from servers"). Then the broadcasts end `failed`, and the recording too, with `The egress service
stopped responding`. A start request also settles saved broadcasts whose egress LiveKit no longer
reports in progress, so a lost `egress_ended` cannot block the room. The reverse case, an egress no
broadcast references while LiveKit still runs it, is one a request lost track of (LiveKit started it
after the request timed out, or the replica stopped before saving): its first event stops it. The
event alone is not enough, since events of an egress Meet already stopped keep arriving late, so
LiveKit's current status is read first. `room_finished` stops the egress and ends what is left,
since an egress still starting would otherwise recreate the room. The recording service now ignores
LiveKit's in-progress egresses whose recording Meet already ended.

### Permissions enforced at the API

`broadcastControl` gates the routes; a start body with any entry by name and URL also needs
`broadcastAddDestinations`, checked by a middleware before `broadcast.enabled`, so a refused add is
`403` before any `409` or `422`. The UI and the embedded commands use the participant's room member
token on the same REST routes, so hiding controls is never the enforcement. The two permissions stay
independent values; the wizard only disables the dependent switch.

### Config shape

`config.broadcast` reuses the recording layouts, presets and encoding validation. `destinations` is
optional in requests (`MeetBroadcastConfigOptions`): omitted keeps the saved list, sent replaces it,
since a deep merge would merge arrays by index. The rule that enabling needs a destination runs on the
merged config in the room service, after the end-to-end encryption rule turned broadcast off, because
it depends on the saved list.

### Egress unavailable

With no egress service, LiveKit answers `StartRoomCompositeEgress` with `503` only after about 21 s,
beyond the SDK's 10 s timeout. Both the `503` and the timeout map to `503` `No egress service is
available` for starting a broadcast or a recording and for `UpdateStream`.

## Risks / Trade-offs

- [The stream position is egress behavior, not a LiveKit contract] → verified in the egress source of
  the OpenVidu fork and of upstream `main` (2026-10-15) and exercised by the broadcast integration
  tests on every egress upgrade; a fingerprint in the redacted URL, carried by the OpenVidu egress
  fork, or a stream identifier upstream (livekit/egress#1423) would make it explicit.
- [Updates of every destination wait while any destination of the meeting is still connecting] →
  egress behavior; a destination that never connects delays the others' `broadcastUpdated` until it
  fails.

- [A room whose `room_finished` fails after the room left the database keeps its Redis value] →
  nothing reads it again, since room ids are never reused.
- [A webhook waiting for the room's broadcast lock delays the LiveKit events queued behind it] →
  LiveKit delivers through a keyed pool of 10 workers; waits measured under 5 s.
- [Each destination costs about 3 Mbps of the egress host's upload at 720p] → the wizard and the
  activity show the estimate for the destinations chosen.
- [Only the browser that added a destination for the meeting can restart it] → accepted: the server
  never returns a full URL.
- [Concurrent changes to a room's broadcasts beyond 10 s answer `409` instead of queueing] →
  accepted; a change normally takes well under a second.

## Migration Plan

- Rooms migrate from schema v7 to v8: `config.broadcast` arrives disabled with no destinations,
  layout `grid` and encoding `H264_720P_30`, `broadcastDestinationUrls` empty, and the role
  permissions normalized so both broadcast permissions complete to `false`. Room members migrate from
  v5 to v6 with the same permission normalization. `MIGRATION_REV` is refreshed for both.
- Tokens issued before the upgrade complete both permissions to `false` when read.
- Forward only: every replica runs the same version, and an older version refuses to start on the
  migrated schema. Redis broadcast keys are deleted when the broadcasts end.
