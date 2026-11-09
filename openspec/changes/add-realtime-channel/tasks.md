# Tasks

## 1. Server channel

- [ ] 1.1 Add `ws` (and `@types/ws` as a dev dependency) to `meet-ce/backend`; verify `./meet.sh install` and the backend build succeed.
- [ ] 1.2 Extract the room member token lookup (header with `Bearer`, then the `roomMemberToken` query parameter) into a helper that takes headers and `URLSearchParams`, used by `getRoomMemberToken` and by the handshake; verify with the existing auth unit and integration tests unchanged.
- [ ] 1.3 Implement `RealtimeService`:
  - the upgrade handler on the server of `startServer()`, matching `<base path>internal-api/v1/realtime` and leaving other paths alone;
  - token verification with `verifyRoomMemberToken` under a 5 s timeout, and close codes `4401`, `4403` and `1013`;
  - the local registry by room and identity;
  - the JSON envelope, inbound frames dropped and `maxPayload`;
  - the 20 s cycle: ping, termination of unanswered connections, and the `heartbeat` message to connections that received nothing else;
  - expiry timers;
  - `registerHandler` hooks, with the close code (feature codes `4000`-`4099`, `1001`) passed to `onClose`.

  Verify with unit tests that drive the clock through the scheduler collaborator, not real sleeps.
- [ ] 1.4 Add the subscriber connection (`duplicate()`) to `RedisService` and rename `redisPublisher` to the shared client. In `RealtimeService`:
  - publish and subscribe per room, registering a connection and running `onOpen` only after its room's `SUBSCRIBE` is confirmed;
  - count subscriptions per room including operations in flight;
  - on the subscriber's `close`, refuse new connections with `1013` and keep the open ones;
  - on the subscriber's `ready` after a loss, run every handler's `onOpen` for every local connection.

  Verify with unit tests of the subscription bookkeeping (open and close racing on the same room) and of the resync.
- [ ] 1.5 Add integration tests against real Redis, with a listening server on an ephemeral port and two `RealtimeService` instances as two replicas, using a test-only handler:
  - delivery from the other replica, and to two connections of one identity;
  - nothing delivered to another identity;
  - close codes for a missing token, a token without identity, an invalidated token and an expired token;
  - a subscriber connection dropped and restored: connections stay open and the handler's state is resent.

  Put them in a `tests/integration/realtime` suite with its `test:integration-realtime` script, and register the suite in `scripts/ci/changed-suites.mjs` and `.github/workflows/ci.yaml`. Verify they pass against the local deployment, or report them as not run.
- [ ] 1.6 Update `meet-ce/backend/CLAUDE.md`: replace "there is no pub/sub channel between replicas" with the realtime channel, its seam, the rule that features resend state on connection open, and the note that `redisDisconnected` does not fire during an outage; verify `./meet.sh lint-backend` passes.

## 2. Browser client

- [ ] 2.1 Add `RealtimeConnectionService` to `shared-meet-components` (meeting domain):
  - the URL from the Meet base URL, `wss://` for `https` and `ws://` for `http`;
  - `connect(tokenProvider, { maxDelayMs })` and `messages$(type)`;
  - reconnection after 1, 2, 4 and up to 30 s (or `maxDelayMs`) with ±30 % jitter;
  - reconnection after 50 s without any message, and at once on `online` or on becoming visible after more than 25 s without one;
  - one immediate retry with a fresh token on `4401`, then stop; stop on `4403`;
  - `disconnect(code?)` wired into the meeting teardown.

  Verify with Karma specs over a fake `WebSocket` and a mocked clock.
- [ ] 2.2 Check that a web component served from Meet and embedded in the testapp opens its connection against the Meet origin and that removing the element closes it; verify with a Karma spec of the URL builder and by hand in the testapp (`./meet.sh dev --testapp`).

## 3. Deployment check

- [ ] 3.1 Open a realtime connection through the OpenVidu local deployment's proxy (Caddy, on the Meet path) with a test token, leave it idle for two minutes and confirm it survives; record the result in this task. No configuration change is expected.
- [ ] 3.2 Repeat on an Elastic or High Availability deployment with two Meet replicas: connect through the load balancer, produce a message on the replica that does not hold the connection, stop that replica's Redis subscription and the replica itself, and confirm delivery, resync and reconnection; record the result in this task.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`: no line. The channel changes nothing a user, an integrator or an operator can observe until a feature uses it; the waiting room's entry covers it.
- [ ] 4.2 openvidu.io: none.

## Workflow follow-up

- Archive with `/opsx:archive` inside the pull request once every task is done, then run `npx openspec validate --all --strict`.
- This change lands before `add-waiting-room`, which depends on it.
