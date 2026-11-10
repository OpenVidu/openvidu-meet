# Tasks

## 1. Server channel

- [ ] 1.1 Add `ws` (and `@types/ws` as a dev dependency) to `meet-ce/backend`; verify `./meet.sh install` and the backend build succeed.
- [ ] 1.2 Implement `RealtimeService`:
  - the upgrade handler on the server of `startServer()`, matching `<base path>internal-api/v1/ws` and leaving other paths alone;
  - `registerAuthenticator(queryParameter, resolve)`: a request without a registered credential parameter destroyed before the upgrade, each handshake counted against its client address's limit for the other API routes through an explicit store given to `apiLimiter`, which the handshake increments with the key the limiter derives (IPv6 subnet included); the count is per replica, as for every route (HTTP `429` over it), the address derived as Express derives `req.ip` (`proxy-addr` with `app.get('trust proxy fn')`, set from `SERVER_TRUST_PROXY`), at most 100 handshakes in flight per replica (HTTP `429`), no logging of `req.url`, then the resolution under a 5 s timeout, and close codes `4403` (unknown credential) and `1013` (timeout);
  - the local registry by room and address, at most 5 connections per room and address, a sixth closing the oldest with `1008`;
  - the JSON envelope, inbound frames dropped and `maxPayload`;
  - the 20 s cycle: ping, termination of unanswered connections, `lastSeenAt` updated on each answer, and the `heartbeat` message to every connection;
  - `registerHandler` hooks (`onOpen`, `onPong`, `onClose`), and a connection exposing its room, address, `lastSeenAt` and `send(type, data)`, which writes to its socket directly, for the state a hook sends on open and on pong; no close code reaches a feature, and the server never closes a connection on a feature's behalf.

  Verify with unit tests that drive the clock through the scheduler collaborator, not real sleeps.
- [ ] 1.3 Add the subscriber connection (`duplicate()`) to `RedisService` and rename `redisPublisher` to the shared client. In `RealtimeService`:
  - subscribe to the single channel `ov_meet:realtime:<MEET_REDIS_DB>` at startup, logging a refused subscription (an ACL user without `&ov_meet:*`) as an error, and publish `{ roomId, addresses, type, data }` to it, each replica delivering through its local registry and dropping what has no local recipient;
  - no tracking of the subscriber: open connections stay open and new ones are accepted while it is down, and ioredis re-subscribes by itself.

  Verify with unit tests of the local delivery filter.
- [ ] 1.4 Add integration tests against real Redis, with a listening server on an ephemeral port and two `RealtimeService` instances as two replicas, using a test-only authenticator and handler:
  - delivery from the other replica, and to two connections of one address;
  - nothing delivered to another address, nor to an instance on another Redis database;
  - a request without a credential refused before the upgrade (the browser sees no close code), `4403` for an unknown credential, and `1008` for the oldest of six connections of one address;
  - a subscriber connection dropped and restored: connections stay open, a connection opened meanwhile is accepted and receives what the test handler sends with `connection.send` on open and on pong;
  - handshakes beyond an address's rate limit answered `429` (with the limit enabled for the test), also behind a trusted proxy: two clients with different `X-Forwarded-For` addresses each have their own bucket, and the proxy's address is not the one counted.

  Put them in a `tests/integration/realtime` suite with its `test:integration-realtime` script, and register the suite in `scripts/ci/changed-suites.mjs` and `.github/workflows/ci.yaml`. Verify they pass against the local deployment, or report them as not run.
- [ ] 1.5 Update `meet-ce/backend/CLAUDE.md`: replace "there is no pub/sub channel between replicas" with the realtime channel, its seam, the rule that features send their state on connection open and recover lost messages on their own, and the note that `redisDisconnected` does not fire during an outage; verify `./meet.sh lint-backend` passes.

## 2. Browser client

- [ ] 2.1 Add `RealtimeConnectionService` to `shared-meet-components` (meeting domain):
  - the URL from the Meet base URL, `wss://` for `https` and `ws://` for `http`;
  - `connect({ credential }, { giveUpAfterMs })`, the credential in the query, and `messages$(type)`;
  - reconnection after 1, 2, 4 and up to 30 s with ±30 % jitter, with the same credential, and, with `giveUpAfterMs`, a stop reported as given up that long after the last message received;
  - reconnection after 50 s without any message, and at once on `online` or on becoming visible after more than 25 s without one;
  - stop on `4403` and on `1008`, reporting why; reconnect on `1013`;
  - `disconnect()` closing for good, called by a feature that expects nothing more and wired into the meeting teardown.

  Verify with Karma specs over a fake `WebSocket` and a mocked clock.
- [ ] 2.2 Check that a web component served from Meet and embedded in the testapp opens its connection against the Meet origin and that removing the element closes it; verify with a Karma spec of the URL builder and by hand in the testapp (`./meet.sh dev --testapp`).

## 3. Deployment check

- [ ] 3.1 Open a realtime connection through the OpenVidu local deployment's proxy (Caddy, on the Meet path) with a test credential, leave it idle for two minutes and confirm it survives; record the result in this task. No configuration change is expected.
- [ ] 3.2 Repeat on an Elastic or High Availability deployment with two Meet replicas: connect through the load balancer, produce a message on the replica that does not hold the connection, stop the replica, and confirm delivery and reconnection; record the result in this task, or record that it was not run and why.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`: no line of its own. The channel changes nothing a user, an integrator or an operator can observe until a feature uses it; the waiting room's entry and its upgrade note (the proxy requirement) cover it.
- [ ] 4.2 openvidu.io (`next`): in `docs/meet/deployment/basic.md` ("Networking"), state that a proxy or load balancer of the operator's own in front of Meet must pass WebSocket upgrades (`Upgrade` and `Connection` headers) on the Meet path and keep idle connections open for more than 20 seconds, and link that paragraph from `docs/meet/deployment/advanced.md`, adding that no sticky sessions are needed across replicas and that an external Redis whose Meet user is restricted by ACL grants it the channel permission `&ov_meet:*`. Add a troubleshooting line: a meeting that shows the connection error screen while waiting to be let in, with a console error naming the WebSocket URL, means a proxy or network between the browser and Meet blocks WebSocket upgrades.

## Workflow follow-up

- Archive with `/opsx:archive` inside the pull request once every task is done, then run `npx openspec validate --all --strict`.
- This change lands before `add-waiting-room`, which depends on it.
