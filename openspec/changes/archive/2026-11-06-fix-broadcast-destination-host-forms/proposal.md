# Proposal

## Why

`live-broadcast` refuses a destination whose host is or resolves to a loopback, link-local, unspecified, multicast
or broadcast address, so the media server never streams to its own host or to the cloud metadata endpoint. The check
reads the host of an `rtmp://` URL as written, but the egress reads it the way a web address host is read: escapes
decoded and characters that stand for others mapped to them. A host written that way passes the check and reaches
the forbidden address:

- `rtmp://127。0。0。1/live/key` (ideographic full stops), `rtmp://①②⑦.0.0.1/live/key`,
  `rtmp://１６９.２５４.１６９.２５４/live/key` (fullwidth digits): Meet sees no IP address, the name does not
  resolve, and the destination is accepted.
- `rtmp://ⓛocalhost/live/key`, `rtmp://%6c%6f%63%61%6c%68%6f%73%74/live/key`: the same with a name.
- `rtmp://0x7f.1/live/key` and `rtmp://127.0.0.1./live/key` depend on the resolver of the replica.

Verified end to end on the local deployment on 2026-11-06: destinations written as `172。18。0。12`,
`１７２.１８.０.１２` and `ⓐdv-rtmp` (the container name of an RTMP server, with a circled letter) were accepted and
their broadcasts went `active` on that server, so the egress maps them; the same forms of `127.0.0.1` and
`169.254.169.254` would reach the egress host and the metadata endpoint.

## What Changes

- Meet judges a destination's host as the media server reads it: it reads the URL's host as a web address host
  (percent escapes decoded, Unicode mapped to the name or address it stands for, IPv4 shorthands expanded) before
  checking it against the forbidden ranges or resolving it.
- A room destination or a destination of `broadcastStart` written that way answers `422` with the usual
  "is not allowed" message, storing and streaming nothing.
- Hosts that do not resolve and private network addresses are still accepted; what is stored is still the URL as
  sent.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-broadcast`: "Destinations where no RTMP server can live" says how the host is read and adds two scenarios.

## Impact

- REST API: `createRoom`, `updateRoomConfig` and `broadcastStart` answer `422` to these destinations; the OpenAPI
  already lists it. No contract change.
- Webhooks, embedded API (`broadcastStart` sends the same body), meeting UI, console UI, deployment configuration:
  not affected.
- Code: `BroadcastHelper.assertDestinationsAllowed` in `meet-ce/backend/src/helpers/broadcast.helper.ts`.
- Related: `fix-broadcast-loopback-dns-rebinding` (a name that resolves differently for Meet and for the egress) is
  still open; this change covers the way the host is written, not the DNS answer.
- openvidu.io: none.
