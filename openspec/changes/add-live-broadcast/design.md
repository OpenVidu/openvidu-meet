## Context

Meet already records meetings with LiveKit's room-composite egress, writing a file. The same egress
can write RTMP streams instead, and LiveKit's `UpdateStream` adds and removes stream URLs on a running
egress. Three facts of LiveKit shape the design (probed against the local deployment):

- A stream has no identifier upstream. LiveKit reports each stream by its URL with the key redacted
  (`{abc...xyz}`, ends of at most three characters), in no stable order, and some platforms rewrite
  the URL they report (Twitch). The egress keeps a stopped stream in `streamResults`, so a URL streamed
  to again is listed twice.
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
  progress.
- Recording and broadcasting from the same egress.
- Reporting a destination that is reconnecting: it stays `active` while the egress retries it.
  LiveKit reports the retries at most once a minute; exposing them is left for later.

## Decisions

### A REST API shaped like the recordings one

The broadcasts are a top-level `/broadcasts` group, as recordings are (decided 2026-10-15, over an
earlier sub-resource of `/meetings/{roomId}`): start takes the `roomId` in its body and optional
destinations, `GET /broadcasts/{broadcastId}` and `POST /broadcasts/{broadcastId}/stop` take the id
alone, the list needs its `roomId` (broadcasts only exist within one live meeting), and
`POST /broadcasts/stop` stops several or all of a room in one request for the meeting's Stop broadcast
and the embedded `broadcastStop`. A `broadcastId` is `{roomId}--{id}`, so the room, its permissions and
its Redis value follow from the id as a recording's room follows from its id. The `{id}` part is
Meet's own, since LiveKit has no identifier per stream; should it get one, the id can carry it as a
recording's carries its egress id. `MEET_API_REST_GROUPS` and the naming charter gain `broadcasts`.

### One egress per meeting, one stream per broadcast

The first broadcast of a meeting starts a room-composite egress with a single RTMP URL; each later one
joins it through `UpdateStream` with one URL. The meeting is composed and encoded once and sent to
every destination. One egress per destination was rejected: it composes and encodes the meeting once
per destination. An earlier single broadcast with a list of destinations was replaced because a
destination had no lifecycle of its own (stop, retry, status, webhooks) and a failing one failed the
whole broadcast. The layout and encoding of the room config apply to the egress; a broadcast that
joins a running egress reports the egress's own.

### A broadcast finds its stream by a tag

Meet adds each destination URL with the fragment `#ov-stream-tag=<broadcastId>`. The OpenVidu egress
(a patch to `pkg/config/urls.go` of its fork) streams to the URL without it and appends it to the
redacted URL it reports, in the responses and in every egress webhook, so a broadcast reads its
stream's status, dates and error from the entry ending with its own tag, whatever the order of the
entries. Rejected: the position of the stream (egress behavior, not a contract), the redacted key
(keys with the same ends collide, Twitch rewrites the URL), a fingerprint of the URL (a URL streamed
to again repeats it), and one egress per destination (it composes and encodes the meeting once per
destination: about one core each, against 1.5 cores for five destinations on one egress). An egress
without the patch reports no tag: the start that meets it answers `500` and withdraws its stream.
The change is proposed upstream in livekit/egress#1423.

### State in Redis under a per-room lock

The broadcasts in progress live in one Redis hash, `ov_meet:broadcasts`, with a field per room: the
list of records with the full URL and the egress id, removed when the last one ends. Reads take no
lock: the list and a broadcast are one `HGET`, `broadcastActive` one `HEXISTS`, and the rooms that
have broadcasts one `HKEYS`, whose cost follows those rooms and not the size of the keyspace. A key
per room was rejected because finding the rooms then needs a `SCAN` of the whole database, shared
with LiveKit and the rest of Meet: measured on a database of a million keys, about 95,000 calls and
7.5 s for each sweep. A change is written only when it alters a record, so the repeated snapshots
LiveKit sends cost a read. It has no TTL: a
meeting without a duration limit streams for as long as it lasts, and a record that expired would
make the next event of its egress look like one no broadcast references, which gets stopped. The
meeting's end forgets it instead, through `room_finished` or the reconciliation below. Every change,
from a request or from a LiveKit webhook on any replica, runs
under the Redis lock `ov_meet_lock:broadcast_<roomId>`, extended while the change runs: a start can
make several calls to LiveKit, each allowed 10 s, and a change that outlived the lock's 30 s TTL
would let another replica's change run beside it and be overwritten by it. The TTL only frees the
lock of a replica that died holding it. A request waits up to 10 s for it and then answers `409`; a
webhook waits up to 30 s, since it carries LiveKit's latest snapshot, and one that gives up leaves it
to the reconciliation sweep. A MongoDB collection like the recordings one was rejected: there is
nothing to list once the meeting ends.

### Full URLs stay out of the domain

The room document stores the full URL of each saved destination in `broadcastDestinationUrls`, keyed
by destination id, outside the `MeetRoom` shape; the config and every response carry the URL with its
stream key, what follows the last `/` as the egress reads it, replaced by `********`, so a URL stays
valid once redacted and a query string attached to the key goes with it. A config update resolves each
sent destination against those URLs: an `id` with the redacted URL exactly as served keeps the saved
one, a full URL replaces it, anything else is `422`. A destination given for one meeting is kept
only in the Redis record, so only the browser that added it knows its full URL and can start it again.
The creation log redacts the room options.

### Destinations where no RTMP server can live

The media server connects to every destination, and the error of a failed attempt (refused, timed
out) tells one address from another, so a destination is a probe into the network the media server
sees. A destination whose host is or resolves to a loopback, link-local, unspecified, multicast or
broadcast address is refused with `422`, on a room's config and on every start, since a hostname can
change where it points: such a URL only reaches the media server's own host or the cloud metadata
endpoint. The criteria are those of the webhook destinations (OpenVidu/openvidu-meet#91): private
networks stay allowed, since a self-hosted RTMP server usually lives on one, which leaves them
mappable by whoever may add a destination, and a host that does not resolve is let through.

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
A broadcast only moves forward: a snapshot older than what its record already knows, which a webhook
queued behind a reconciliation can carry, changes nothing.

### Lost egresses and lost webhooks

A room's broadcasts are reconciled with LiveKit for whatever its webhooks never told the server:
the latest snapshot of an egress in progress is applied, an egress LiveKit reports ended settles its
broadcasts, and an egress in progress whose participant left the room and that no egress service
answers died with its egress service, which LiveKit never reports and keeps listing in progress. The
probe is an empty `UpdateStream`: only a dead egress service answers `503` ("no response from
servers"). Those broadcasts end `failed` with `The egress service stopped responding`, and a
recording in the same case too. A room LiveKit no longer has is cleaned as `room_finished` does. The
reconciliation runs on the egress `participant_left`, on every start request, and in a sweep at
startup and every minute over the rooms of that hash, so a webhook lost
while every replica was down, a killed egress or a restarted LiveKit leave nothing behind; measured
on the local deployment: an egress killed is settled in about 23 s, and 3 s after Meet starts again
when it was killed with Meet down. The reverse case, an egress no
broadcast references while LiveKit still runs it, is one a request lost track of (LiveKit started it
after the request timed out, or the replica stopped before saving): its first event stops it. The
event alone is not enough, since events of an egress Meet already stopped keep arriving late, so
LiveKit's current status is read first. `room_finished` stops the egress and ends what is left,
since an egress still starting would otherwise recreate the room. The recording service now ignores
LiveKit's in-progress egresses whose recording Meet already ended.

### Two lists in a start body

A start body names the room destinations in `destinationIds` and the destinations for that meeting in
`destinations` (decided 2026-10-19). It replaced one `destinations` list whose entries were either a
`destinationId` alone or a `name` and `url`, told apart by the fields they carried, with a rule that the
id could not travel with a name or URL. Each list now holds one kind of entry, and each maps to one
permission. The server keeps an omitted `destinationIds` (every room destination not streamed to yet,
which the meeting's Go live and a bare `broadcastStart()` rely on) apart from an empty one (none of
them), so a client always sends the list when it means only those; the UI does. An id the room does not
have is `400`, a body that names nothing to stream to is `422`. The answer lists the room destinations
first and then the meeting's, each in the order asked for, which is how a client ties its own
destinations to their broadcasts.

### Permissions enforced at the API

`broadcastControl` gates the routes; a start body with any entry in `destinations` also needs
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

- [Broadcasts need the OpenVidu egress, which reports stream tags] → OpenVidu releases Meet and its
  egress together and never mixes versions; an egress without the tag is met by a `500` that streams
  nothing, never by a broadcast stuck in `starting`. Proposed upstream (livekit/egress#1423).
- [An add that times out, which the egress applies after the request withdrew it] → that stream runs
  without a broadcast until its egress ends: removing it needs its full URL, which only the failed
  request had. Not seen in the measurements.
- [Updates of every destination wait while any destination of the meeting is still connecting] →
  egress behavior, bounded: the egress gives up on a destination after its first connection error,
  measured at about 6 s for a host that never answers and for one that accepts the connection but
  never speaks RTMP (2026-10-15). Each update is a full snapshot, so a held-back change arrives late,
  never lost.

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
