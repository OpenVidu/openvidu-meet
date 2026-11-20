# Design

## Context

See proposal.md for why. In 3.10.0 a broadcast finds its stream through a tag in the URL
(`#ov-stream-tag=<broadcastId>`, added by `BroadcastHelper.taggedUrl`), which the OpenVidu egress strips
before streaming and appends to the redacted URL it reports; `BroadcastHelper.findStream` reads the entry
ending with the tag, and `createRecord` answers `500` (`errorEgressWithoutStreamTags`) when no entry does.
Removing a stream sends its tagged URL in `UpdateStream.remove_output_urls`.

What LiveKit's egress offers now (livekit/egress#1462, protocol#1873, read from the merged diff):

- `StreamOutput.destinations` at start and `UpdateStreamRequest.add_destinations` on a running egress take
  `{id, url}`; the id is required and the egress echoes it as `StreamInfo.id` (empty for plain URLs).
- A duplicate id or a duplicate URL within one egress is invalid input, and an id is never reused in an
  egress even after its stream was removed.
- Removal is unchanged: `remove_output_urls` with the URL as it was given.

Measured on 2026-11-03 against the OpenVidu egress 1.15.0 and a server carrying the new protocol: ids come
back on the start and on the add, removal by raw URL finishes the stream, a duplicate id answers `400`.
Against the published `openvidu-server:main` (protocol 1.51), `destinations` is dropped without error and a
start with only destinations answers `400 missing or invalid field: stream url`.

## Goals / Non-Goals

**Goals:**

- Delete the tag mechanism (the URL fragment, its parsing and its guard) and read the stream by id.
- Keep every observable behavior of 3.10.0: statuses, webhooks, one stream key per meeting, a destination
  streamed to again, and the reconciliation of broadcasts that ended unreported.

**Non-Goals:**

- One egress per destination, a layout or encoding per destination: separate decisions that the id does not
  force (see the 3.10.0 design: the cost of composing once per destination).
- Keeping the tag as a fallback for an egress without ids: that egress is not supported (see below).
- Changing the id format: the broadcast id (`{roomId}--{random}`) is already unique per start.

## Decisions

### The destination id is the broadcast id

Each start already creates a fresh broadcast id, so the egress never sees an id twice, which is what it
requires, and a destination streamed to again is a new broadcast with a new id. Alternatives: a separate
id (a second identifier to store and keep in step) or the destination id (reused when the destination is
streamed to again, which the egress rejects).

### Start and join send destinations, removal sends the plain URL

`startRoomComposite` takes the stream output with `destinations: [{id, url}]` instead of `urls`;
`LivekitService.updateStream` gains the destinations to add; a broadcast joins a running egress through
them. Stopping and withdrawing send `destination.url` without a tag. `findStream` compares `StreamInfo.id`
with the broadcast id, so it no longer depends on the order, the redaction or Twitch's rewrite of the URL.

### The guard stays, with a new reason

`createRecord` still refuses a response whose stream has no id and answers `500` with the broadcast
withdrawn, renamed to name stream ids. Two shapes of unsupported stack end there or before it: an egress
that starts the stream but reports no id, and a server that drops `destinations` (its start fails as invalid
input, which `toEgressError` turns into an error response, and nothing streams). The apply phase probes both
against the integration stack and keeps `500` for both.

### The egress patch is reverted in the same release

OpenVidu releases Meet, the server and the egress together and never mixes versions, so the release that
carries this change also carries the egress without OpenVidu/egress#5. A 3.10.x Meet needs the patch and a
Meet with this change needs the ids: the two must not meet. Deployments upgrade the three images at once.

### Broadcasts in progress at the upgrade

The upgrade restarts the egress, which ends its egresses; the reconciliation already settles the broadcasts
of an egress that died while the server was down, ending them `failed` within a minute of the server
starting. No record is read through the tag after the upgrade, so no migration is needed.

### Several Meet replicas

Nothing changes in the coordination: the broadcast id and the egress id live in the Redis hash under the
per-room lock, and any replica matches a stream by the id the egress reports. Replicas never run different
versions, so none sends a tag while another sends an id.

## Risks / Trade-offs

- [The SDK Meet uses is not released with destinations] → the change waits for it; nothing is applied
  before. Meanwhile 3.10.0 runs on the tag and its tests.
- [The egress refuses a destination whose URL it already holds, even one it finished] → a destination
  streamed to again in the same egress must be probed before the code lands: the egress keeps a stopped
  stream in its results, and the rejection of a duplicate URL is new in the same upstream change. If the
  stopped stream's URL still counts, the restart starts a new egress or the egress is asked to forget it.
- [CI starts the published OpenVidu images] → the integration and e2e jobs fail on the new code until
  `openvidu-server:main` and `egress:main` carry the protocol and the unpatched egress; the order of the
  apply phase waits for both.
- [Meet stops working with the stock OpenVidu egress 3.10.x] → intended: the support matrix is the three
  images of one release.

## Migration Plan

1. The SDK release and the OpenVidu server sync land (see proposal: Blocked by).
2. Meet changes land with the OpenVidu egress build that no longer strips the tag, in one OpenVidu release.
3. Rollback is the previous release as a whole (Meet, server and egress), as for any release.

## Open Questions

- The first egress release (or OpenVidu egress build) and the first `livekit-server-sdk` version that carry
  the ids, to be named in the CHANGELOG line and the release notes when they exist.
