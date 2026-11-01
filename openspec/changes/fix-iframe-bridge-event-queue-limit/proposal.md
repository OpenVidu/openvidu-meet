# Proposal

## Why

When Meet runs in an iframe that cannot learn its host page (no `ancestorOrigins` and a suppressed
referrer), no one consumes the embedded events. They pile up for the whole page life, each new event copies
the whole queue, and every dismiss with a leave redirect waits a full second.

## What Changes

- When the iframe cannot open the host channel, embedded events are dropped instead of queued.
- The dismiss with a leave redirect no longer waits for a delivery that cannot happen.
- No spec change: "Events arrive in order and none is lost" concerns events that have a consumer; with no
  host channel there is nobody to receive them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- Embedded API: no contract change (iframes without a host channel never delivered events).
- Meeting UI: leave redirect is immediate in that case.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the embedded event bus and the iframe bridge of `shared-meet-components`.
- openvidu.io: none.

## Decisions to confirm

- How to stop the queue. Proposed: the bridge drains and drops when it refuses to open. Alternative: the
  bus queues only while a shell has registered as consumer, which also removes the 1 s wait.

## Source

3.10.0 pre-release audit, finding EM-9 (low, static-high), introduced by #135.
