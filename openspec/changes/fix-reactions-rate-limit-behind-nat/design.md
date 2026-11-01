# Design

## Context

`meet-ce/backend/src/middlewares/rate-limit.middleware.ts` creates one `apiLimiter` (`express-rate-limit`, 500 per minute, keyed by client address, API key requests skipped) and every API router uses that same instance, so all of them share one counter per address. `internalMeetingRouter`, whose only route is `POST /internal-api/v1/meetings/{roomId}/reactions`, uses it too. The meeting throttles reactions to one per second per participant (`MeetingReactionsService`), but the server does not.

The in-flight change `fix-rate-limits-across-replicas` replaces the in-memory counters of the six limiters with a small Redis-backed store, one instance per limiter with its own key prefix (`ov_meet:rate_limit:<limiter>:<key>`), falling back to a local count while Redis is unreachable.

## Goals / Non-Goals

**Goals:**
- Reactions never consume the per-address API budget of the other routes.
- One participant cannot flood a meeting with reactions, whichever replica serves them.

**Non-Goals:**
- Changing any other limit, window or the `429` body.
- Limiting the data packets a participant publishes directly (that is the media grant's job, see `reject-forged-meeting-signals`).

## Decisions

### A reaction limiter keyed by participant

A `reactionLimiter` in `rate-limit.middleware.ts`, built with the same `withTestBypass` wrapper (no limit in `development`, `test` and `ci`), with `windowMs` 1 second, `limit` 2 and a `keyGenerator` that returns `<roomId>:<participantIdentity>` from `RequestSessionService`. It runs in the reactions route right after `withAuth(roomMemberTokenValidator)`, the first point where the identity is known; a request without a valid token is refused by `withAuth` before it counts. `internalMeetingRouter.use(apiLimiter)` is removed, so reactions stop counting in the shared address bucket.

Alternative: a separate per-address bucket for reactions. It protects the other routes but still lets one address's participants starve each other's reactions.

### Counting across replicas

The limiter gets its own instance of the Redis-backed store of `fix-rate-limits-across-replicas`, with prefix `reaction`; keys expire with the one-second window. While Redis is unreachable it counts locally, like every other limiter. This is why the change lands after that one.

## Several replicas

A participant's reactions can reach any replica; with the shared store their count is one per participant for the cluster, so the limit holds whatever the load balancer does. No state is kept in process memory beyond the outage fallback that every limiter shares.

## Risks / Trade-offs

- [One Redis round trip per reaction] → The same single command every limited request pays once `fix-rate-limits-across-replicas` lands; reactions are at most one per second per participant.
- [A participant holding several tokens] → Each identity needs its own room member token, whose issuance is limited per address (200 per minute).

## Migration Plan

None: counters are ephemeral and expire with their window.
