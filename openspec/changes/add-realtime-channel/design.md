# Design

## Context

Today the server has one way to push to a client: `FrontendEventService.sendSignal` → `LiveKitService.sendData`, a data packet in the meeting's LiveKit room. Anyone outside the LiveKit room is unreachable. Within the backend, replicas share state through Redis keys and locks only; `meet-ce/backend/CLAUDE.md` states that there is no pub/sub channel between them, and `RedisService` holds a single ioredis client that never subscribes.

The HTTP server is created in `startServer()` (`meet-ce/backend/src/server.ts`, `app.listen`), where nothing but an `error` listener is attached. All routes hang from `appRouter` under the base path (default `/meet/`). Integration tests build the app with `createApp()` and drive it with supertest, without a listening server.

Room member tokens are LiveKit-format JWTs: `TokenService.verifyRoomMemberToken` checks signature, expiry and currency (room roles, member and user updates, revocations), and `getRoomMemberToken` reads them from the `X-Room-Member-Token` header or the `roomMemberToken` query parameter. A token minted for joining carries the participant identity in `sub`.

`RedisService` emits `redisDisconnected` on the ioredis `end` event (`redis.service.ts:63`), which ioredis emits only once it stops retrying. The client is created with the default retry strategy and `maxRetriesPerRequest: null`, so during an outage it retries forever, `end` never fires, and commands wait in the offline queue instead of failing.

## Goals / Non-Goals

**Goals:**
- One channel, server to client, addressed by room and participant identity, correct with any number of replicas.
- A seam features plug into (message types, connection hooks) without touching the channel.
- A browser client in `shared-meet-components` that keeps the connection up, notices when it is dead, and hands features their messages.

**Non-Goals:**
- Messages from the client to the server. Persisted chat would add them in its own change.
- Ordering or delivery guarantees across reconnections: features resend state on each connection instead (see Decisions).
- Revoking an open connection when its token is invalidated. The token is checked when the connection opens and when it expires; every action a feature offers still goes through REST with a fresh check.
- Connections for console users (access tokens).

## Decisions

### WebSocket served by Meet, with `ws`

The server uses the `ws` package on the `upgrade` event of the HTTP server created in `startServer()`, so the channel shares port, path prefix, proxy and load balancer with the rest of Meet.

Alternatives considered:
- **Socket.IO** brings rooms, acknowledgements and recovery of missed messages. But it adds about 15 KB to the web component bundle and its own protocol. Its long-polling fallback needs sticky sessions in High Availability, so it would have to be forced to WebSocket only. None of its extras is needed by the waiting room, and persisted chat can add its own acknowledgements on top of `ws`.
- **Server-Sent Events** would cover server-to-client delivery. Persisted chat is expected to need the client-to-server direction, and one mechanism is simpler than two.
- **REST polling** needs nothing new, but gives every feature a latency of one polling interval and a request per client per interval. Features may still use it as a fallback when the channel cannot open (the waiting room does).
- **A separate realtime service** (Centrifugo or similar) would be a new component in every OpenVidu deployment type.
- **A LiveKit room per purpose**, such as the "lock room" planned earlier for the waiting room, needs a WebRTC connection, occupies a media node and adds rooms and webhooks to LiveKit. All four competitors studied keep their waiting room on an application channel, never on the media server.

### The handshake runs outside Express

An upgrade request never reaches Express middleware: there is no `initRequestContext`, no `withAuth` and no `req.query`. `RealtimeService.handleUpgrade(req, socket, head)`:

1. Matches the pathname against `getBasePath() + 'internal-api/v1/realtime'`. Any other path destroys the socket, so other upgrade listeners keep working.
2. Reads the token from the `x-room-member-token` header (`Bearer` prefix) or the `roomMemberToken` query parameter, parsed from `req.url`. The extraction rule moves into a helper that takes headers and a `URLSearchParams`, so the REST path and the handshake share it.
3. Completes the upgrade, then calls `TokenService.verifyRoomMemberToken`, which runs the same currency checks as REST, and requires `sub`. The verification has a 5 s timeout: during a Redis outage its reads would otherwise wait in the offline queue indefinitely.
4. Rejects a connection by closing it before registering it:
   - `4401` (unauthorized) for a missing, invalid or expired token;
   - `4403` (forbidden) for a token without identity;
   - `1013` (try again later) while the replica's Redis subscription is down or the verification times out.

   A browser cannot read the HTTP status of a refused upgrade (it only sees `1006`), so refusing with an HTTP `401` would leave the client unable to tell "renew your token" from "network down".

The handshake runs inside a fresh request context, so logs keep the correlation id.

### Addressing and envelope

A connection is keyed by `(roomId, participantIdentity)`, taken from the token. The server API is:

- `sendToParticipant(roomId, identity, type, data)`
- `sendToParticipants(roomId, identities, type, data)`

Frames are JSON `{ "type": string, "data": unknown }`. Types are namespaced by feature (`lobby.state`); `heartbeat` is the channel's own and carries no data. Frames from the client are dropped. The server caps them at 4 KB through the `maxPayload` option of `ws`, so a client cannot make the server buffer large messages.

Close codes `4000`-`4099` belong to features: a client closes with one to tell a feature why it left (the waiting room uses `4000`). The channel passes every close code to the features' `onClose`, including `1001`, which browsers send when the page is closed or navigates away.

### Replicas: Redis publish/subscribe per room

Each replica opens one extra ioredis connection, `RedisService.redisPublisher.duplicate()`, for subscriptions. A subscribed connection cannot run other commands, and ioredis re-subscribes on reconnect. The existing client publishes. The `redisPublisher` field is renamed to what it is, the shared client.

- **Channel:** one per room, `ov_meet:realtime:<roomId>`. A replica subscribes when its first local connection for that room opens and unsubscribes when its last one closes, so a replica only receives traffic for rooms it serves.
- **Order on open:** a connection is registered, and its features' `onOpen` run, only once the room's `SUBSCRIBE` is confirmed. A change made between a feature's state read and the subscription would otherwise be lost.
- **Bookkeeping:** subscriptions are counted per room, including subscribe and unsubscribe operations still in flight, so a connection that opens while the room's last one closes never ends up without a subscription.
- **Message:** `{ identities, type, data }` (`identities` empty means none). Every replica, including the sender, delivers through its local registry. Delivery therefore follows one path whether or not the recipient is local, and the order of one publisher is kept.
- **Not used:** a single global channel would send every replica every message. Redis Streams with replay would add retention, cursors and trimming, and current-state-on-connect already covers what replay would.

### Liveness and token expiry

- **Ping:** one interval per replica pings every connection every 20 s. A connection whose previous ping went unanswered is terminated. 20 s sits below common idle timeouts (AWS ALB 60 s, NGINX 60 s). This is how the server notices a client that vanished.
- **Heartbeat:** in the same interval, the replica sends `{ "type": "heartbeat" }` (about 20 bytes) to every connection that received no other message since the previous interval. Browsers answer protocol pings without telling the page, so without a message the page cannot tell a dead connection (network switch, laptop waking up, a proxy that dropped the stream) from a quiet one. The cost is one tiny frame per idle connection every 20 s, sent from the replica's memory, with no Redis or database access.
- **Token expiry:** a timer per connection, set to the token's `exp`, closes it with `4401`, the same code as an invalid token: in both cases the client needs a fresh token.

### Redis subscription lost and back

The channel watches its own subscriber connection instead of `redisDisconnected`, which does not fire during an outage (see Context), and which belongs to the other connection anyway: the subscriber can drop and come back on its own while the shared client stays up.

- On the subscriber's `close`, the replica marks its subscription as down. Open connections stay open. New connections are closed with `1013`.
- On the subscriber's `ready` after a loss, ioredis has re-subscribed the rooms. The replica then runs every feature's `onOpen` for every local connection, so each client gets the current state of every feature and nothing published during the gap is missed.

Closing every connection instead would have the same effect for the client but cost a reconnection storm, a token verification per connection and, for the waiting room, presence churn.

### Seam for features

`RealtimeService.registerHandler({ type prefix, onOpen(connection), onClose(connection, closeInfo) })`, an injectable singleton. Features use the hooks to send their state on open and to track presence. The channel keeps no presence of its own: presence rules differ per feature, and the waiting room keeps a lease (`add-waiting-room`). PRO overrides or extends through DI like any other service.

### Browser client

`RealtimeConnectionService` in `shared-meet-components` (meeting domain, provided per meeting like `MeetingLiveKitService`):

- **Connecting:** `connect(tokenProvider, { maxDelayMs })` builds the URL from the Meet base URL, `wss://` for `https` and `ws://` for `http` (development), so the web component connects to its Meet origin, not the host page.
- **Messages:** `messages$(type)` hands each feature its messages.
- **Reconnecting:** after an unexpected close it waits 1, 2, 4, then up to 30 s, each with ±30 % jitter, and asks `tokenProvider` for a fresh token every time. A feature may cap the delay with `maxDelayMs` (the waiting room uses 5 s).
- **Dead connections:** the client reconnects when it has received nothing, heartbeats included, for 50 s. On the browser's `online` event, and when the page becomes visible, it reconnects at once if nothing arrived for more than 25 s.
- **Auth failures:** on `4401` it reconnects once at once with a fresh token, and stops if that one is refused too. On `4403` it stops. Either way it reports the channel as unavailable to its caller.
- **Teardown:** `disconnect(code?)` is called on meeting teardown, so a removed web component never leaves a connection behind. A feature may pass its own close code.

### Load balancers and proxies

OpenVidu's Caddy and the High Availability load balancer already carry LiveKit's signalling WebSocket on the same port, so no deployment change is needed. Caddy closes proxied WebSockets when its configuration reloads; the client reconnects as for any loss. Sticky sessions are not needed: any replica can hold a connection, because delivery goes through Redis.

## Risks / Trade-offs

- [A reconnect storm after a replica stops (every client of that replica at once)] → Jittered, growing delays. Each reconnection costs one token verification, which does three Redis reads at most.
- [A pub/sub message lost while the subscriber was down (Sentinel failover, network blip)] → The replica resends every feature's state to its connections when the subscriber is ready again.
- [Heartbeat load] → One frame of about 20 bytes per idle connection every 20 s, only from the replica's memory: 1,000 idle connections are 50 frames a second.
- [A third-party proxy that strips `Upgrade` headers or times out idle connections under 20 s] → Documented in the proposal's Impact. The client keeps retrying with growing delays, and features stay usable through REST.
- [Tokens in URLs reaching proxy access logs] → Same exposure as LiveKit's own signalling URL, which carries the same JWT, and as the existing `roomMemberToken` query parameter for media sources. The tokens are short-lived (2 h).
- [Integration tests run without a listening server] → The realtime tests start one with `createApp()` plus `http.createServer` on an ephemeral port. They run two `RealtimeService` instances on separate Redis connections to act as two replicas.

## Migration Plan

Nothing persisted changes. Deploying adds the path. Rolling back removes it, and clients see refused connections, which only matters once a feature uses the channel.
