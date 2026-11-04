# Proposal

## Why

A direct link or iframe `src` whose query string repeats a parameter, for example
`?secret=...&language=es&language=fr` (a host appending its own `language` to a stored URL that already has
one), leaves the page blank with no join screen. With a single `language` the page works.

## What Changes

- Every query parameter read by the embedded entry yields its first value when it is repeated, so the
  repeated `language` above starts the entry in Spanish instead of failing.
- No spec change: "The same attributes in every embedding mode" already requires a query parameter to behave
  like the attribute of the same name; a repeated one only needs a defined value, which is a task of the
  fix (first value wins, as the router's own parameter lookup).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `embedded-api` "The same attributes in every
embedding mode" and `localization` "Language requested by the host".

## Impact

- Embedded API: iframe and direct-link query parameters; no contract change (a repeated parameter was never
  documented).
- Meeting UI: the join screen appears instead of a blank page.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the query parameter extraction of the shared utilities in `shared-meet-components`.
- openvidu.io: none.

## Decisions to confirm

- Which value wins for a repeated parameter. Proposed: the first, as the router returns. Alternative: the
  last, as most hosts append their override.

## Source

3.10.0 pre-release audit, finding EM-1 (low, verified-live), introduced by #135.
