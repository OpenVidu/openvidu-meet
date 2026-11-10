# Design

## Context

Today the server has one way to push to a client: `FrontendEventService.sendSignal` → `LiveKitService.sendData`, a data packet in the meeting's LiveKit room. Anyone outside the LiveKit room is unreachable. Within the backend, replicas share state through Redis keys and locks only; `meet-ce/backend/CLAUDE.md` states that there is no pub/sub channel between them, and `RedisService` holds a single ioredis client that never subscribes.

The HTTP server is created in `startServer()` (`meet-ce/backend/src/server.ts`, `app.listen`), where nothing but an `error` listener is attached. All routes hang from `appRouter` under the base path (default `/meet/`). Integration tests build the app with `createApp()` and drive it with supertest, without a listening server.

The first feature on the channel, the waiting room, deliberately gives its users no token: they hold an opaque waiting ticket kept in Redis (`add-waiting-room`). Persisted chat, expected next, will connect participants who hold room member tokens.

`RedisService` emits `redisDisconnected` on the ioredis `end` event (`redis.service.ts:63`), which ioredis emits only once it stops retrying. The client is created with the default retry strategy and `maxRetriesPerRequest: null`, so during an outage it retries forever, `end` never fires, and commands wait in the offline queue instead of failing.

## Goals / Non-Goals

**Goals:**
- One channel, whose application messages go from the server to the client, addressed by room and an address the feature chooses, correct with any number of replicas.
- A seam features plug into (how a connection is authenticated and addressed, message types, connection hooks) without touching the channel.
- A browser client in `shared-meet-components` that keeps the connection up, notices when it is dead, and hands features their messages.

**Non-Goals:**
- Messages from the client to the server. Persisted chat would add them in its own change.
- Ordering or delivery guarantees across reconnections or replicas: features send their state on each connection and recover lost messages on their own (see Decisions).
- Authenticating with room member tokens: no feature in this change needs it; persisted chat adds a token authenticator in its own change, with the expiry handling that tokens need.
- Connections for console users (access tokens).

## Decisions

### WebSocket served by Meet, with `ws`

The server uses the `ws` package on the `upgrade` event of the HTTP server created in `startServer()`, so the channel shares port, path prefix, proxy and load balancer with the rest of Meet.

Alternatives considered:
- **Socket.IO** brings rooms, acknowledgements and recovery of missed messages. But it adds about 15 KB to the web component bundle and its own protocol. Its long-polling fallback needs sticky sessions in High Availability, so it would have to be forced to WebSocket only. None of its extras is needed by the waiting room, and persisted chat can add its own acknowledgements on top of `ws`.
- **Server-Sent Events** would cover server-to-client delivery. Persisted chat is expected to need the client-to-server direction, and one mechanism is simpler than two.
- **REST polling** needs nothing new, but gives every feature a latency of one polling interval and a request per client per interval. It is not kept as a fallback either: a network that blocks WebSockets to Meet also blocks LiveKit's signalling, which is WebSocket only and goes through the same domain and port, so a client there cannot use the meeting anyway.
- **A separate realtime service** (Centrifugo or similar) would be a new component in every OpenVidu deployment type.
- **A LiveKit room per purpose**, such as the "lock room" planned earlier for the waiting room, needs a WebRTC connection, occupies a media node and adds rooms and webhooks to LiveKit. All four competitors studied keep their waiting room on an application channel, never on the media server.

### The handshake runs outside Express

An upgrade request never reaches Express middleware: there is no `initRequestContext`, no `withAuth` and no `req.query`. `RealtimeService.handleUpgrade(req, socket, head)`:

1. Matches the pathname against `getBasePath() + 'internal-api/v1/ws'`. Any other path destroys the socket: Meet has no other upgrade listener (`server.ts`).
2. Finds the authenticator registered for the credential the query carries (`?lobbyTicket=…` for the waiting room). A request whose query names no registered credential is destroyed before the upgrade. Each handshake counts against its client address's limit for the other API routes (500 per minute, "Rate limiting per client address" in `deployment`), which Express middleware cannot apply to an upgrade: `apiLimiter` gets an explicit store that the handshake increments with the key the limiter derives (express-rate-limit masks an IPv6 address to its subnet), and the count is per replica, as for every route. The client address is derived as Express derives `req.ip`: `proxy-addr` over the socket address and `X-Forwarded-For` with the app's `trust proxy` function (`app.get('trust proxy fn')`, set from `SERVER_TRUST_PROXY`), so behind the proxies of an OpenVidu deployment each client has its own bucket, not the proxy's: over it, the replica answers HTTP `429` and destroys the socket. The replica also admits at most 100 handshakes in flight at once, answering HTTP `429` and destroying the socket beyond it. `req.url` carries the credential, so the handshake never logs it.
3. Completes the upgrade, then asks the authenticator to resolve the credential to a room and an address, under a 5 s timeout: during a Redis outage a read would otherwise wait in the offline queue indefinitely.
4. Rejects a connection by closing it before registering it:
   - `4403` (forbidden) for a credential the authenticator does not know;
   - `1013` (try again later) when the resolution times out.

   A browser cannot read the HTTP status of a refused upgrade (it only sees `1006`), so a refusal the client must act on (show that the credential is no longer valid) comes after the upgrade, as a close code.

The handshake runs inside a fresh request context, so logs keep the correlation id. The page's origin is not checked: Meet uses no cookies, so a connection is only as strong as its credential.

### Addressing and envelope

A connection is keyed by `(roomId, address)`, which its authenticator returns (the waiting room addresses a connection by its wait). The server API is:

- `send(roomId, address, type, data)`
- `sendMany(roomId, addresses, type, data)`

Frames are JSON `{ "type": string, "data": unknown }`. Types are namespaced by feature (`lobby.state`); `heartbeat` is the channel's own and carries no data. A replica keeps at most 5 connections per room and address: a sixth closes the oldest with `1008` (policy violation), so a credential holder cannot pile up connections on one replica. Frames from the client are dropped. The server caps them at 4 KB through the `maxPayload` option of `ws`, so a client cannot make the server buffer large messages.

Close codes carry nothing for features. A client that has something to tell a feature, such as leaving the waiting room, calls that feature's REST operation, which arrives whether or not the connection is up at that moment; a close frame is lost when the connection is already down or the page goes away first.

The server never closes a connection on a feature's behalf. A feature that has nothing more to say to a client says so in its own message (the waiting room, with the final state of a wait), and the feature's client calls `disconnect()`, which stops reconnecting. A server close could not do it: the change that ends the conversation may run on a replica that does not hold the connection, and a close addressed by address would also close that address's other connections.

### Replicas: one Redis publish/subscribe channel

Each replica opens one extra ioredis connection, `RedisService.redisPublisher.duplicate()`, for subscriptions. A subscribed connection cannot run other commands, and ioredis re-subscribes on reconnect. The existing client publishes. The `redisPublisher` field is renamed to what it is, the shared client.

- **Channel:** one for the cluster, `ov_meet:realtime:<db>`, which every replica subscribes to when it starts. There is no subscription per room, so no bookkeeping of subscriptions in flight and no ordering between a connection's registration and a `SUBSCRIBE`. `<db>` is `MEET_REDIS_DB`: publish/subscribe ignores the database number, so without it two deployments sharing a Redis server in different databases (or the integration tests next to a development backend) would receive each other's messages.
- **ACL:** Redis 7 gives a user created with ACL no channel permission unless `acl-pubsub-default` says otherwise, so a restricted `MEET_REDIS_USERNAME` needs `&ov_meet:*`. The default user, which OpenVidu's own Redis uses, has every channel.
- **Before the first subscription:** a connection that opens before the replica's subscription is confirmed is registered at once; messages it could have missed are recovered by its feature.
- **Message:** `{ roomId, addresses, type, data }`. Every replica, including the sender, delivers through its local registry and drops what has no local recipient. Messages addressed by room and address go through the channel; replies of a hook go straight to their connection (see "Seam for features"). The messages one replica publishes reach each connection in the order it published them; a reply sent straight to a connection can overtake one of them. Messages of two publishers may arrive in either order: a feature whose state two replicas can change at once makes its client independent of that order (the waiting room: a final state is sticky, and the state is sent again on every answered ping).
- **Cost:** every replica receives every message. Messages are small and rare (the waiting room sends one per waiter whose state changes), so parsing and dropping them is negligible next to the bookkeeping a per-room subscription needs. A feature whose traffic outgrows one channel shards it in its own change.
- **Not used:** Redis Streams with replay would add retention, cursors and trimming, and the state each feature sends on connect, plus its own recovery, covers what replay would.

### Liveness

- **Ping:** one interval per replica pings every connection every 20 s. A connection whose previous ping went unanswered is terminated. 20 s sits below common idle timeouts (AWS ALB 60 s, NGINX 60 s). This is how the server notices a client that vanished.
- **Last seen:** each connection records `lastSeenAt`, the last time its client answered a ping (or opened it). The server notices a silent loss up to 40 s late, so a feature that measures presence uses `lastSeenAt` instead of "the connection is still open".
- **Heartbeat:** in the same interval, the replica sends `{ "type": "heartbeat" }` (about 20 bytes) to every connection, with no bookkeeping of which ones received something else. Browsers answer protocol pings without telling the page, so without a message the page cannot tell a dead connection (network switch, laptop waking up, a proxy that dropped the stream) from a quiet one. The cost is one tiny frame per connection every 20 s, sent from the replica's memory, with no Redis or database access.

### Redis subscription lost and back

The channel does not rely on `redisDisconnected`, which does not fire during an outage (see Context) and belongs to the other connection anyway: the subscriber can drop and come back on its own while the shared client stays up.

The replica does not track its subscriber: ioredis re-subscribes after a reconnection, open connections stay open and new ones are accepted. Messages published meanwhile are lost; features recover them with the state their hooks send straight to each connection on open and on every answered ping, which does not go through the subscription (the waiting room's).

Alternatives considered:
- Resending every feature's state to every local connection when the subscriber is ready again. It needed `close` and `ready` tracking and a second, awaited `SUBSCRIBE` (ioredis re-subscribes without waiting for the reply), and it did not cover a message lost while the subscription was up (a publisher dying after its write). The waiting room's state on every answered ping covers both.
- Closing every connection on a loss: a reconnection storm, a credential resolution per connection and, for the waiting room, presence churn.

### Seam for features

A feature calls `RealtimeService.register({ credential, resolve, onOpen, onPong, onClose })` on an injectable singleton: `credential` is the query parameter that carries its credential, `resolve(credential)` returns `{ roomId, address }` or null, and the hooks run only for the connections its own credential opened, so two features never see each other's connections. `onPong` runs each time the connection's client answers a ping. A connection exposes its room, its address, `lastSeenAt` and `send(type, data)`, which writes to its socket directly. Features use the hooks to send their state on open and on pong through `connection.send`, so that state does not depend on the subscription, and to track presence. The channel keeps no presence of its own: presence rules differ per feature (the waiting room writes it on each pong, `add-waiting-room`). PRO overrides or extends through DI like any other service.

### Browser client

`RealtimeConnectionService` in `shared-meet-components` (meeting domain, a root service torn down with the meeting, like `MeetingLiveKitService`):

- **Connecting:** `connect({ credential: { name, value } }, { giveUpAfterMs })` builds the URL from the Meet base URL, `wss://` for `https` and `ws://` for `http` (development), with the credential in the query, so the web component connects to its Meet origin, not the host page.
- **Messages:** `messages$(type)` hands each feature its messages.
- **Reconnecting:** after a close it did not ask for, it waits 1, 2, 4, then up to 30 s, each with ±30 % jitter, and reconnects with the same credential. A feature may give up with `giveUpAfterMs`, counted from the last message received, heartbeats included (the waiting room uses 60 s, about five attempts); the client then stops and reports that it gave up.
- **Dead connections:** the client reconnects when it has received nothing, heartbeats included, for 50 s. On the browser's `online` event, and when the page becomes visible, it reconnects at once if nothing arrived for more than 25 s.
- **Refusals:** on `4403` (credential not known) and on `1008` (a newer connection of the same address took its place) it stops and reports why to its caller; on `1013` it reconnects as after any loss.
- **Stopping:** `disconnect()` closes the connection for good. A feature calls it when it expects nothing more, and the meeting teardown calls it, so a removed web component never leaves a connection behind.

### Load balancers and proxies

OpenVidu's Caddy and the High Availability load balancer already carry LiveKit's signalling WebSocket on the same port, so no deployment change is needed. Caddy closes proxied WebSockets when its configuration reloads; the client reconnects as for any loss. Sticky sessions are not needed: any replica can hold a connection, because delivery goes through Redis.

A proxy of the operator's own in front of Meet can still break the channel when its rule for the Meet path does not pass the `Upgrade` and `Connection` headers (an NGINX `location` without them, for instance) or closes idle connections within 20 s. The deployment pages of openvidu.io state both requirements.

## Risks / Trade-offs

- [A reconnect storm after a replica stops (every client of that replica at once)] → Jittered, growing delays. Each reconnection costs one credential resolution (one Redis read for the waiting room).
- [A pub/sub message lost while the subscriber was down (Sentinel failover, network blip, an ACL without `&ov_meet:*`), or never published (the publisher died)] → Features resend their state straight to the connection, the waiting room on every answered ping, so a replica without its subscription still brings its clients up to date within one cycle.
- [Heartbeat load] → One frame of about 20 bytes per connection every 20 s, only from the replica's memory: 1,000 connections are 50 frames a second.
- [Handshake flood] → A request without a known credential parameter is dropped before the upgrade; the others count against their address's API rate limit and cost one Redis read each, with at most 100 in flight per replica, and a valid credential holds at most 5 connections per replica.
- [A third-party proxy that strips `Upgrade` headers or times out idle connections under 20 s] → Documented on the openvidu.io deployment pages and in the waiting room's upgrade note. The client keeps retrying with growing delays.
- [Every replica receives every message] → Negligible at the waiting room's volume; a feature with heavier traffic shards the channel in its own change.
- [An external Redis whose Meet user has no channel permission] → `SUBSCRIBE` fails and every feature using the channel stops working. The upgrade note of the first feature using it and the deployment pages state `&ov_meet:*`; the replica logs the refusal at startup.
- [Credentials in URLs reaching proxy access logs] → Same exposure as LiveKit's own signalling URL, which carries its JWT, and as the existing `roomMemberToken` query parameter. The waiting ticket dies with its wait.
- [Integration tests run without a listening server] → The realtime tests start one with `createApp()` plus `http.createServer` on an ephemeral port. They run two `RealtimeService` instances on separate Redis connections to act as two replicas.

## Migration Plan

Nothing persisted changes. Deploying adds the path. Rolling back removes it, and clients see refused connections, which only matters once a feature uses the channel.
