# Proposal

## Why

Reactions count toward the same per-address limit as every other API request, 500 per minute shared by meetings, rooms, recordings, users and webhooks. Nine or more participants behind one public address (an office, a classroom) reacting at the meeting's pace of one per second use that budget up, and then every request from that address is refused for the rest of the minute: raising a hand, muting, starting a recording, reading the room on join. A single modified client does the same alone, and nothing on the server limits how fast one participant reacts.

## What Changes

- The reactions endpoint (`participantReactionSend`) no longer counts toward the per-address API limit.
- The server limits reactions per participant instead: at most 2 per second for each participant of a meeting, counted across every Meet replica, answering `429` beyond it. The stock meeting sends at most one per second, so it never reaches the limit.
- A participant over the limit gets `429` only for reactions; their other requests, and every request of other participants behind the same address, are not affected.
- The new limit uses the cluster-wide counter store that `fix-rate-limits-across-replicas` introduces, with its own key prefix (see design.md).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reactions`: a new requirement "The server limits reactions per participant".
- `deployment`: "Rate limiting per client address" leaves the reactions endpoint out of the 500-per-minute API limit and points to `reactions`.

## Impact

- Internal REST API: `participantReactionSend` answers `429` per participant instead of per address; the internal OpenAPI already lists `429`. No public contract changes.
- Embedded API: the `participantReactionSend` command goes through the same endpoint; no contract change.
- Meeting UI: none for the stock client; a reaction refused with `429` leaves the sender's screen, as any rejected reaction does.
- REST API (public), webhooks, console UI, deployment configuration: other routes keep their limits; no new variable.
- Code: `meet-ce/backend/src/middlewares/rate-limit.middleware.ts` (a reaction limiter keyed by participant) and `meet-ce/backend/src/routes/meeting.routes.ts` (the internal meetings router stops using `apiLimiter`).
- Relation to `fix-rate-limits-across-replicas` (in-flight, worktree `fix-deployment-docs`): that change moves the six existing limiters to a Redis-backed store and modifies `deployment` "Rate limits count across the cluster"; this one adds a seventh limiter on that store and modifies a different requirement, "Rate limiting per client address". This change lands after it.
- openvidu.io: none. No page documents rate limits per endpoint.

## Decisions to confirm

- The limit. Proposed: 2 reactions per second per participant, a fixed one-second window that the stock client's one-per-second pace never fills even with network jitter. Alternative: a per-minute budget such as 60 per minute, which tolerates short bursts from a modified client.
- What the limit counts by. Proposed: the room and the participant identity of the room member token. Alternative: keep counting by client address, but in a bucket of its own for reactions, so reactions no longer starve the other routes but participants behind one address still share it.
- Order with `fix-rate-limits-across-replicas`. Proposed: land after it and reuse its store. Alternative: land first with an in-memory count per replica, and that change adds the reaction limiter to the ones it moves to Redis.

## Source

3.10.0 pre-release audit, finding IM-6 (medium, verified-live), introduced by #117.
