# Proposal

## Decisions

- Meet identifies the stream of a broadcast with the stream id LiveKit's egress reports, and the URL tag of the
  OpenVidu egress fork (OpenVidu/egress#5) goes away. Decided by the user on 2026-11-17.
- Nothing a user, an integrator or an operator of OpenVidu 3.10.0 observes changes: statuses, webhooks, one stream
  key per meeting, a destination streamed to again. Decided by the user on 2026-11-17.
- The 3.10.0 mechanism (the URL tag) stays on `main` until Meet needs no patch at all: this change merges only
  when a `livekit-server-sdk` release carries `@livekit/protocol` 1.53.1 or later and `updateStream` with
  destinations (livekit/node-sdks#769 and #772). The pull request is a draft until then, and the override and the
  private transport call it carries are removed before it merges. Decided by the user on 2026-11-17.
- The egress patch is removed after Meet merges, before 3.10.0 is released if the SDK release comes in time.
  Proposed, open.

## Why

Live broadcast, new in 3.10.0 (unreleased), finds the stream of each broadcast through a tag Meet appends to the
destination URL (`#ov-stream-tag=<broadcastId>`), which only the OpenVidu egress understands: it is a patch of the
OpenVidu fork (OpenVidu/egress#5), written because LiveKit's egress had no way to tell its streams apart
(livekit/egress#1423). LiveKit's egress now has one (livekit/egress#1462, livekit/protocol#1873): a stream is added
as a destination with an id chosen by the client and reported back as `StreamInfo.id`. Adopting it removes a
functional patch from the egress OpenVidu ships and lets broadcasts run on LiveKit's egress as it is.

## What Changes

- Meet identifies the stream of a broadcast by the id it gives it (the broadcast id), sent when the egress starts
  and when a destination joins a running one, and read back from the stream the egress reports. The URL tag and
  everything that adds and reads it disappear.
- Removing a stream still uses the destination's real URL, now without the tag.
- A deployment whose egress does not report stream ids still answers `broadcastStart` with `500` and streams
  nothing; only the reason changes from "no stream tags" to "no stream ids".
- No public contract changes: REST API, webhooks, embedded API and UI behave as before.

## State of what this depends on (2026-11-17)

- **OpenVidu LiveKit server: ready.** `OpenVidu/openvidu-livekit` is on a protocol with the destination fields and
  the published `openvidu/openvidu-server:main` (LiveKit 1.13.11) passes them on.
- **OpenVidu egress: ready.** The published `openvidu/egress:main` (branch `v1.15.0-1f99030`) carries
  livekit/egress#1462. It also still carries the tag patch, which a URL without the tag never triggers.
- **`livekit-server-sdk`: not ready.** The latest release, 2.20.0, depends on `@livekit/protocol` 1.53.0, one
  version short of `StreamDestination` (1.53.1), and `EgressClient.updateStream` adds streams by URL only. The
  protocol bump (livekit/node-sdks#769) and the `addDestinations` parameter (livekit/node-sdks#772) are both open.
  See the third decision.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-broadcast`: the requirement "Broadcasts need an egress service" is replaced by "Broadcasts need an egress
  service that reports stream ids", which asks for an egress that reports a stream id
  instead of the tag only the OpenVidu egress reports; same `503` and `500` behavior.

## Impact

- REST API, webhooks, embedded API, meeting UI and console UI: none. No public contract changes, not even
  additively. The only change an operator can observe is which egress broadcasts need.
- Deployment: broadcasts need an egress that reports stream ids and a LiveKit server that passes destinations on,
  which the server and egress images of OpenVidu 3.10.0 do. Meet, the server and the egress are released together,
  as always; no mixed versions.
- Backend: `BroadcastHelper`, `BroadcastService`, `LiveKitService` and the broadcast error model, with their unit
  tests; `@livekit/protocol` becomes a declared dependency of the backend, pinned for `livekit-server-sdk` too.
- Documentation: `meet-ce/backend/CLAUDE.md` describes the tag. No openvidu.io page names it (the live broadcast
  page only says it runs on the deployment's egress service), so none changes.
- No CE extension seam is needed.
