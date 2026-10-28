# Proposal

## Why

A load test of the in-meeting request path (a participant's room member token, a room-scoped route, a
LiveKit data signal: the path reactions use today and a server-relayed chat would use) saturated one
backend replica at about 150 requests per second, at roughly 6 ms of CPU per request. A CPU profile
showed that a third of that work repeats itself or is thrown away: every room-scoped request builds
and compiles its route parameter schema from scratch, checks the room twice in MongoDB, waits for
MongoDB and Redis one after the other, and every signal asks LiveKit whether the room exists before
sending to it. A prototype of the four fixes cut the CPU per request by 36%, the median latency from
11.4 ms to 7.1 ms, and moved saturation to between 200 and 300 requests per second. The choice
between relaying chat through the API and a dedicated channel should be made on those numbers, not
on the current ones.

## What Changes

- The room ID and recording ID route parameter validators are built once, not on every request.
  Today 27 room-scoped routes and 2 recording-scoped routes rebuild them, and the compiled-schema
  mode compiles each new schema before use.
- Validating a room member token runs its independent lookups (the room's roles update date, the
  participant's token revocation, the member's permissions update date, the user's role update
  date) in parallel instead of one after the other.
- The room permission check does not look the room up again when the room member token that
  authenticated the request was just validated against that same room.
- Sending a data signal to a meeting no longer asks LiveKit whether the room exists first. A room
  without a meeting is detected from LiveKit's not-found answer to the send itself, and the signal
  is skipped exactly as today. Every signal benefits: recording updates, permission refreshes,
  moderator mutes and reactions.
- Static frontend assets are matched after the API routes, so an API request no longer costs a
  filesystem lookup in the frontend directory first.

No behavior changes: every request is accepted, refused and answered as before, with the same status
codes and bodies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is an efficiency refactor; no requirement in `openspec/specs/` changes, so the change
declares `skip_specs`.

## Impact

- **REST API, internal API, webhooks, embedded API, meeting UI, console UI:** no contract or behavior
  change. Responses keep their status codes, bodies and failure modes.
- **Deployment:** no new configuration. Each replica does less CPU, MongoDB and LiveKit API work per
  in-meeting request; MongoDB and LiveKit see fewer queries per request.
- **Code:** backend only (`meet-ce/backend`): route parameter validators, the room member token
  validator, the room permission middleware, the LiveKit data sending, and the static file mount
  order in the server setup.
- **PRO:** no seam changes. PRO overrides services, and none of the overridable service signatures
  change.
- **openvidu.io:** no page changes.
