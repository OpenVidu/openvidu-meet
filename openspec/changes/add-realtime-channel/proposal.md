## Why

The Meet server can only reach a client through the LiveKit data channel, so it can only talk to participants already connected to a meeting. The waiting room (`add-waiting-room`) has to tell someone who is not in the meeting yet that they were admitted or rejected, and persisted chat is expected to need a channel between the server and its clients as well. Both need the same piece: a realtime connection from each client to Meet that works with any number of replicas. It is built once, as a shared channel, before the first feature that uses it.

## What Changes

- The Meet server accepts WebSocket connections at `<base path>/internal-api/v1/realtime` on its HTTP port. A connection is authenticated with a room member token that names a participant identity, given as the existing `roomMemberToken` query parameter (browsers cannot set headers on a WebSocket) or the `X-Room-Member-Token` header.
- A message the server addresses to a participant of a room reaches every open connection of that participant, on whichever replica holds it. Replicas relay messages to each other through Redis publish/subscribe, the first cross-replica channel of Meet.
- The channel only carries messages from the server to the client in this change; whatever a client sends is ignored. Features send their current state each time a connection opens, so a client that reconnects never depends on a message it missed.
- Liveness:
  - the server pings every connection every 20 seconds and closes one that does not answer;
  - in the same cycle it sends a small heartbeat message to every connection that received nothing else, so a client notices a dead connection that the browser keeps open;
  - the server closes a connection when its token expires;
  - the meeting client reconnects with growing, randomized delays, and at once when the network comes back or the page becomes visible again after a silence.
- When a replica loses its Redis subscription and gets it back, it sends the current state of every feature to each of its connections again, since the messages published meanwhile were lost. While the subscription is down it refuses new connections and asks the client to try again later.
- No feature uses the channel in this change. The waiting room is its first user.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: realtime connections deliver a participant's messages whichever replica holds the connection, are kept alive and resumed, and get their state again when a replica's Redis subscription comes back.
- `authentication`: which credential opens a realtime connection, when it is refused and when it is closed.

## Impact

- REST API, webhooks, embedded API: not affected. The realtime path belongs to the internal API, which has no compatibility promise.
- Meeting UI and console UI: no visible change. The meeting client gains a connection service that nothing uses yet.
- Deployment: no new configuration variable and no new port. The WebSocket upgrade travels on the Meet path and port, through the same proxy and load balancer that already carry LiveKit's signalling WebSocket in every OpenVidu deployment type. An operator who puts their own proxy or load balancer in front of Meet must let WebSocket upgrades through and keep idle connections open for more than 20 seconds. Each replica opens one more Redis connection, for subscriptions.
- Backend: new dependency `ws`. The backend `CLAUDE.md` statement that there is no pub/sub channel between replicas changes.
- CE extension seams: features register their message types and connection hooks through an injectable service, so PRO can add its own without touching the channel.
- openvidu.io: no page changes.

## Decisions taken

USER, 2026-11-08:
- The token travels in the `roomMemberToken` query parameter. LiveKit's own client already sends the same JWT as `access_token` in the query of its signalling WebSocket, through the same proxies, so the channel adds no exposure. No single-use ticket.
- The heartbeat balances load against state sync: one tiny frame per idle connection per ping cycle, handled by the replica alone, without Redis.

## Decisions to confirm

- Server-to-client only. Messages from the client (persisted chat would send its messages this way) are left to the change that needs them.
