## Why

The Meet server can only reach a client through the LiveKit data channel, so it can only talk to participants already connected to a meeting. The waiting room (`add-waiting-room`) has to tell someone who is not in the meeting yet that they were admitted or rejected, and persisted chat is expected to need a channel between the server and its clients as well. Both need the same piece: a realtime connection from each client to Meet that works with any number of replicas. It is built once, as a shared channel, before the first feature that uses it.

## What Changes

- The Meet server accepts WebSocket connections at `<base path>/internal-api/v1/ws` on its HTTP port. Each feature that uses the channel registers the credential that opens a connection, given in its query (browsers cannot set headers on a WebSocket), and the address the connection gets: the waiting room's is its opaque waiting ticket, never a token.
- A message the server addresses to an address of a room reaches every open connection of that address, on whichever replica holds it. Replicas relay messages to each other through one Redis publish/subscribe channel per Redis database, which every replica subscribes to when it starts, the first cross-replica channel of Meet. Publish/subscribe ignores the Redis database number, so the channel name carries it: deployments sharing a Redis server in different databases never receive each other's messages.
- The connection is bidirectional like any WebSocket, but no feature sends application messages from the client in this change, so whatever a client sends is ignored. The client still tells the server when it was last in touch, through its answers to pings; anything else it has to tell a feature, such as leaving the waiting room, goes through that feature's REST operation, which arrives even while the connection is down. Features send their current state each time a connection opens and recover on their own from a message that never arrived, so a client never depends on any single message.
- Liveness:
  - the server pings every connection every 20 seconds and closes one that does not answer;
  - in the same cycle it sends a small heartbeat message to every connection, so a client notices a dead connection that the browser keeps open;
  - the meeting client reconnects with growing, randomized delays, and at once when the network comes back or the page becomes visible again after a silence. It reconnects with the same credential, and stops when the server no longer knows it;
  - a feature that has nothing more to say to a client says so in its own message, and its client closes the connection for good, such as the waiting room after the final state of a wait. The server never closes a connection for a feature: the connection may be held by another replica.
- When a replica loses its Redis subscription, it keeps its connections and accepts new ones, and still sends each connection the state its features send on open and on every answered ping, which goes straight to the connection; messages published meanwhile are lost, and that state recovers them.
- A handshake counts against its client address's API rate limit, like any other request; the address is the one Express derives, honouring `SERVER_TRUST_PROXY`, so clients behind a proxy do not share one bucket.
- No feature uses the channel in this change. The waiting room is its first user.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: realtime connections deliver a participant's messages whichever replica holds the connection, are kept alive and resumed, and stay open when a replica's Redis subscription drops.
- `authentication`: a realtime connection opens only with a credential a feature accepts, and is refused otherwise.

## Impact

- REST API, webhooks, embedded API: not affected. The realtime path belongs to the internal API, which has no compatibility promise.
- Meeting UI and console UI: no visible change. The meeting client gains a connection service that nothing uses yet.
- Deployment: no new configuration variable and no new port. The WebSocket upgrade travels on the Meet path and port, through the same proxy and load balancer that already carry LiveKit's signalling WebSocket in every OpenVidu deployment type. An operator who puts their own proxy or load balancer in front of Meet must let WebSocket upgrades through and keep idle connections open for more than 20 seconds. Each replica opens one more Redis connection, for subscriptions. A Redis user restricted by ACL (`MEET_REDIS_USERNAME`) also needs the channel permission `&ov_meet:*`: Redis 7 grants no channel to a user created with ACL unless told to.
- Backend: new dependency `ws`. The backend `CLAUDE.md` statement that there is no pub/sub channel between replicas changes.
- CE extension seams: features register their credential, message types and connection hooks through an injectable service, so PRO can add its own without touching the channel.
- openvidu.io: the deployment pages state what a proxy or load balancer of the operator's own in front of Meet needs (WebSocket upgrades let through on the Meet path, and idle connections kept open for more than 20 seconds), and what a Redis user restricted by ACL needs (`&ov_meet:*`). The waiting room is the first feature that depends on them, so its `CHANGELOG.md` upgrade note carries both requirements.

## Decisions taken

USER, 2026-11-09 (spec review rounds 9 and 10).

- The channel is the realtime transport of Meet, not a waiting room detail: persisted chat will send its messages from the client over it.
- No polling fallback: a network that blocks WebSockets to Meet also blocks LiveKit's signalling.
- One channel for the whole cluster, subscribed at startup, its name carrying the Redis database (`ov_meet:realtime:<db>`); a Redis user restricted by ACL needs `&ov_meet:*`, which the deployment pages document.
- No resend when a replica's Redis subscription comes back. The replica keeps its connections and accepts new ones while the subscription is down, ioredis re-subscribes by itself, and messages published meanwhile are lost: each feature recovers from a lost message on its own. The waiting room resends its state on every answered ping, straight to the connection.
- The heartbeat goes to every connection each cycle; the deployment pages document the proxy requirement.
- The server never closes a connection for a feature, and close codes carry nothing for features: a feature ends a conversation with its own message, and a client that has something to tell a feature calls its REST operation.
- Features get an `onPong` hook, so presence is written when the client answers.
- A replica keeps at most 5 connections per room and address; a sixth closes the oldest with `1008`.
- The client gives up after `giveUpAfterMs` counted from the last message it received.
- The channel does not authenticate with room member tokens. Each feature registers the credential that opens its connections and resolves it to a room and an address; the waiting room's is its opaque waiting ticket. The channel therefore has no token verification, expiry close or renewal; persisted chat adds a token authenticator, with the expiry handling tokens need, in its own change.
Review round 10:
- A connection exposes `send(type, data)`, which writes to its socket directly: the state a feature's hooks send on open and on pong goes through it, never through the Redis subscription, so a replica that lost its subscription still brings its clients up to date.
- Each handshake counts against its client address's limit for the other API routes.

USER, 2026-11-10 (spec review round 11):
- The client address of a handshake is derived as Express derives `req.ip`, honouring `SERVER_TRUST_PROXY`, so every client behind a proxy has its own bucket.
- The ordering guarantee covers what a replica publishes; a reply sent straight to a connection is not ordered with it.

Scope:
- 3.10.0, CE only, any number of replicas; archived after `fix-refresh-of-revoked-session` and before `add-waiting-room`.
