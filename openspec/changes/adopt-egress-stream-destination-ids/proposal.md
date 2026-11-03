# Proposal

## Why

Live broadcast shipped in 3.10.0 finds the stream of each broadcast through a tag Meet appends to the
destination URL (`#ov-stream-tag=<broadcastId>`), which only the OpenVidu egress understands: it is a
patch of the OpenVidu fork (OpenVidu/egress#5), because LiveKit's egress had no way to tell its streams
apart. LiveKit's egress now has one (livekit/egress#1462, protocol#1873): a stream is added as a
destination with an id chosen by the client and reported back as `StreamInfo.id`. Adopting it removes a
functional patch from the egress OpenVidu ships and lets broadcasts run on LiveKit's egress as it is.

The change is planned now and applied later: it cannot start until the Node SDK Meet uses can send
destinations (see "Blocked by").

## What Changes

- Meet identifies the stream of a broadcast by the id it gives it (the broadcast id), sent when the
  egress starts and when a destination joins a running one, and read back from the stream the egress
  reports. The URL tag and everything that adds, strips and reads it disappear.
- Removing a stream still uses the destination's real URL, now without the tag.
- A deployment whose egress does not report stream ids still answers `broadcastStart` with `500` and
  streams nothing; only the reason changes from "no stream tags" to "no stream ids".
- OpenVidu's egress drops the tag patch (revert of OpenVidu/egress#5), so the egress image carries no
  Meet-specific behavior.
- No public contract changes: REST API, webhooks, embedded API and UI behave as in 3.10.0.

## Blocked by

- **`livekit-server-sdk` release (out of our hands).** The Node SDK Meet uses must carry
  `@livekit/protocol` 1.53.1 or later and let `updateStream` add destinations (the protocol bump is
  livekit/node-sdks#769; the `addDestinations` parameter is livekit/node-sdks#772, open). The protocol bump
  alone is not enough: today `updateStream` takes only URLs.
- **OpenVidu LiveKit server (ours).** `OpenVidu/openvidu-livekit` is synced to a protocol with the
  destination fields (1.53.1 or later, which also needs psrpc 0.8) and `openvidu-server:main` is
  published. A server without it silently drops `destinations`: the start fails with `missing or invalid
  field: stream url` (measured on the local deployment on 2026-11-03).
- **OpenVidu egress (ours, done).** `openvidu/egress:main` is egress 1.15.0 with livekit/egress#1462 since
  2026-11-03.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-broadcast`: the requirement "Broadcasts need an egress service" is replaced by "Broadcasts need an
  egress service that reports stream ids": same `503` and `500` behavior, but the egress it asks for reports
  a stream id instead of the tag only the OpenVidu egress reports.

## Impact

- REST API, webhooks, embedded API, meeting UI and console UI: none. No public contract changes, not even
  additively. The only change an operator can observe is which egress broadcasts need.
- Deployment: broadcasts need an egress that reports stream ids, which the OpenVidu egress image does
  once its tag patch is reverted and the OpenVidu LiveKit server carries the newer protocol. Meet, the
  server and the egress are released together, as always; no mixed versions.
- Backend: `BroadcastHelper`, `BroadcastService`, `LivekitService` and the broadcast error model; their
  unit tests and the integration tests of `broadcasts`, `broadcast-room-config` and `meeting-security`.
- Documentation: `meet-ce/backend/CLAUDE.md` describes the tag. No openvidu.io page names it (the live
  broadcast page only says it runs on the deployment's egress service), so none changes.
- No CE extension seam is needed.
