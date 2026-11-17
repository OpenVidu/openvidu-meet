# Design

## Context

See proposal.md for why. Before this change a broadcast finds its stream through a tag in the URL
(`#ov-stream-tag=<broadcastId>`), which the OpenVidu egress strips before streaming and appends to the redacted URL
it reports; Meet reads the entry ending with the tag, and answers `500` when no entry does. Removing a stream sends
its tagged URL in `UpdateStream.remove_output_urls`.

What LiveKit's egress offers now (livekit/egress#1462, livekit/protocol#1873, read from the merged diff):

- `StreamOutput.destinations` at start and `UpdateStreamRequest.add_destinations` on a running egress take
  `{id, url}`; the id is required and the egress echoes it as `StreamInfo.id` (empty for plain URLs).
- An id is reserved for the life of the egress, even after its stream was removed, and a URL can be streamed to
  once at a time: a duplicate of either is invalid input.
- A stream that finished or failed frees its URL, so the URL can be added again under a new id.
- Removal is unchanged: `remove_output_urls` with the URL as it was given.

## Spike (2026-11-17)

A throwaway stack (Redis, the published `openvidu/openvidu-server:main` and `openvidu/egress:main` pulled by digest,
an RTMP server, a participant publishing video) driven by a Node script with `livekit-server-sdk` 2.19.2 and 2.20.0,
each with `@livekit/protocol` 1.53.1. Nothing of it is merged.

| Step                                                      | Outcome                                                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Start with `destinations: [{id, url}]`                    | The id comes back in the start response, in `ListEgress` and in `egress_started`, `egress_updated` and `egress_ended` |
| Add a destination whose stream key redacts like another's | Both streams report the same redacted URL and are told apart by id                                                    |
| Add a destination under an id already used in the egress  | `400 invalid_argument`, "duplicate stream destination id"                                                             |
| Add a destination whose URL is being streamed to          | `400 invalid_argument`, "duplicate stream url"                                                                        |
| Remove a stream by its plain URL                          | The stream finishes; the others go on                                                                                 |
| Stream again to the removed URL under a new id            | Accepted: a third entry, active, next to the finished one                                                             |
| Remove a URL that is not streamed                         | `404 not_found`                                                                                                       |
| The echo of the request in `EgressInfo`                   | The destination URL comes redacted                                                                                    |

The backend integration suites `broadcasts`, `broadcast-room-config`, `meeting-security` and `webhook` pass against
the same stack with this change (105 tests).

Measured on 2026-11-03 against a server on protocol 1.51: `destinations` is dropped without error and a start with
only destinations answers `400 missing or invalid field: stream url`.

## Goals / Non-Goals

**Goals:**

- Delete the tag mechanism (the URL fragment, its parsing and its guard) and read the stream by id.
- Keep every observable behavior: statuses, webhooks, one stream key per meeting, a destination streamed to again,
  and the reconciliation of broadcasts that ended unreported.

**Non-Goals:**

- One egress per destination, a layout or encoding per destination: separate decisions that the id does not force.
- Keeping the tag as a fallback for an egress without ids: that egress is not supported (see below).
- Changing the id format: the broadcast id (`{roomId}--{random}`) is already unique per start.
- Bumping `livekit-server-sdk`: 2.20.0 brings nothing this change needs.

## Decisions

### The destination id is the broadcast id

Each start already creates a fresh broadcast id, so the egress never sees an id twice, which is what it requires,
and a destination streamed to again is a new broadcast with a new id. Alternatives: a separate id (a second
identifier to store and keep in step) or the destination id (reused when the destination is streamed to again,
which the egress rejects).

### Start and join send destinations, removal sends the plain URL

The start request carries the stream output with `destinations: [{id, url}]` instead of `urls`, and a broadcast
joins a running egress through `add_destinations`. Stopping and withdrawing send the destination's URL without a
tag. The stream of a broadcast is the entry whose `StreamInfo.id` is the broadcast id, so it no longer depends on
the order, the redaction or Twitch's rewrite of the URL.

### The SDK gap is bridged in two places, both deleted when livekit/node-sdks#772 is released

- **Protocol.** `livekit-server-sdk` pins `@livekit/protocol` to a version without `StreamDestination`. The
  workspace overrides that one dependency to 1.53.1 (`livekit-server-sdk>@livekit/protocol`), and the backend
  declares the same version, which it already imported without declaring. The override is scoped so that
  `livekit-client`, which carries its own protocol version into the browser bundle, is untouched; the install
  resolves a single copy for the backend and the SDK.
- **`UpdateStream`.** `EgressClient.updateStream` takes URLs only. `LiveKitService.updateStream` builds the
  `UpdateStreamRequest` itself and sends it through the transport and the authorization of the SDK's egress client,
  so timeouts, failover and the errors Meet maps (`404`, `412`, `503`, `invalid_argument`) stay the SDK's. The
  transport is a private member of the client, reached by a cast in one private method.

Alternatives: wait for the release (the tag and the fork patch stay for an unknown time); a `pnpm patch` of the
SDK's built files (four files to patch, a `patches/` folder for the Docker build to carry); calling the twirp
endpoint with `fetch` (duplicates the SDK's transport and its error shape).

### The guard stays, with a new reason

A start whose response reports no stream under the broadcast id still answers `500` with the broadcast withdrawn,
now naming stream ids. A server that drops `destinations` fails the start as invalid input before that.

### Meet lands first, the egress patch is reverted after it

The published egress carries both mechanisms, so Meet with this change runs on it, and CI, which starts the
published images, stays green at every step. Reverting OpenVidu/egress#5 before Meet lands would fail every
broadcast of `main`. Both land before 3.10.0 is released, so no released Meet ever meets an egress without the
mechanism it uses.

### Broadcasts in progress at the upgrade

The upgrade restarts the egress, which ends its egresses; the reconciliation already settles the broadcasts of an
egress that died while the server was down. No record is read through the tag after the upgrade, so no migration is
needed.

### Several Meet replicas

Nothing changes in the coordination: the broadcast id and the egress id live in the Redis hash under the per-room
lock, and any replica matches a stream by the id the egress reports. Replicas never run different versions, so none
sends a tag while another sends an id.

## Risks / Trade-offs

- [The SDK renames or reshapes the private transport of its egress client] → the unit test of
  `LiveKitService.updateStream` and the broadcast integration suites fail on the bump that does it; the bridge is
  deleted with the first release that carries livekit/node-sdks#772.
- [livekit/node-sdks#772 is merged with another signature] → only `LiveKitService.updateStream` changes.
- [The local OpenVidu deployment of a developer runs images older than 2026-11-17] → its server drops
  `destinations` and refuses every broadcast start as invalid egress options until the images are pulled.
- [Meet stops working with an egress that does not report ids] → intended: the support matrix is the three images
  of one release.

## Migration Plan

1. Meet lands with this change; `openvidu-server:main` and `egress:main` already serve it.
2. OpenVidu/egress#5 is reverted in the branch OpenVidu ships and `egress:main` is published.
3. When a `livekit-server-sdk` release carries livekit/node-sdks#772, the override and the cast are deleted.
4. Rollback is the previous release as a whole (Meet, server and egress), as for any release.
