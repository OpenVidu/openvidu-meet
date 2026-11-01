# Design

## Context

`MeetingService.writeHand` writes `meet.handRaiseDate` with `raisedHandAttributes(Date.now())`, the clock of the replica that serves the request. Every client orders the queue by that attribute (earliest first, ties by identity), and the REST snapshots and the `participantHandChanged` payloads carry it as `handRaiseDate`. Changes to one hand already run under a per-hand Redis lock (`MeetLock.getHandLock`), so every raise talks to Redis before it is written.

## Goals / Non-Goals

**Goals:**
- Two raises served by different replicas are queued in the order the server took them, whatever the replicas' clock skew.

**Non-Goals:**
- Ordering raises that reach the server in a different order than the participants pressed the button (network delay is outside the server's view).
- Changing the type, format or meaning of `handRaiseDate`.

## Decisions

### The Redis server's clock stamps the raise

`RedisService` gains a method that returns the Redis server's time in milliseconds from `TIME` (seconds and microseconds). `writeHand` reads it for a raise, inside the hand lock, and passes it to `raisedHandAttributes`. Every replica talks to the same Redis primary, so every raise of the cluster is stamped by one clock, and the stamps follow the order in which `TIME` ran.

Alternatives:
- Keep `Date.now()`: no extra round trip; the misorder is bounded by the replicas' skew, a few milliseconds when NTP runs.
- A per-meeting `INCR` sequence stored as a second attribute: exact order even across a Redis failover, but a new attribute every client must read for ordering, and still a Redis round trip.

## Several replicas

The point of the change. All replicas share the Redis primary; `TIME` runs there, so the stamps of two replicas are comparable. No state is kept in process memory. With Redis Sentinel, a failover moves `TIME` to another node whose clock may differ by its own skew; raises taken just before and just after the failover may then be misordered by that skew, which is the bound we have today.

## Risks / Trade-offs

- [One more Redis command per raise] → A single `TIME` under a lock the raise already holds; lowers do not read it.
- [Redis unreachable] → The raise already fails on the lock in that case; nothing new.

## Migration Plan

None: no persisted field changes, and hands live only during a meeting.
