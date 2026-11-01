# Proposal

## Why

`./meet.sh set-version 3.10.0` leaves the changelog heading as `## 3.10.0 (unreleased)`, so the release is tagged with a heading that still says unreleased; only the next `-dev` bump removes it. The v3.9.0 tag shipped that way.

## What Changes

- `set-version` strips `(unreleased)` from the heading of the version being set when the version has no prerelease suffix.
- No spec change: release tooling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- Deployment configuration, REST API, webhooks, embedded API, meeting UI, console UI: not affected.
- Code: `set_version` in `meet.sh`.
- openvidu.io: none.

## Decisions to confirm

- None.

## Source

3.10.0 pre-release audit, finding AU-11 (low, verified-test), introduced by earlier releases.
