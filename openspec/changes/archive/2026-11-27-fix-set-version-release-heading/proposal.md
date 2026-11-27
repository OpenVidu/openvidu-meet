# Proposal

## Why

`./meet.sh set-version 3.10.0` leaves the changelog heading as `## 3.10.0 (unreleased)`, so the release is tagged with a heading that still says unreleased; only the next `-dev` bump removes it. The v3.9.0 tag shipped that way.

It is worse in practice: the release workflow that runs `set-version` (`meet-docker-release.yaml` in `OpenVidu/openvidu-deployment`) stages only the `package.json` files, the demo files and the lockfile, never `CHANGELOG.md`, so the changelog edits of both bumps are discarded. The v3.10.0 tag says `## 3.10.0 (unreleased)`, and the 3.11.0-dev bump opened no 3.11.0 release on `main`.

## What Changes

- `set-version` strips `(unreleased)` from the heading of the version being set when the version has no prerelease suffix.
- `CHANGELOG.md` on `main` gets what the 3.10.0 and 3.11.0-dev bumps should have committed: `## 3.10.0` and an open `## 3.11.0 (unreleased)`.
- No spec change: release tooling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- Deployment configuration, REST API, webhooks, embedded API, meeting UI, console UI: not affected.
- Code: `set_version` in `meet.sh`.
- Outside this repository: `meet-docker-release.yaml` in `OpenVidu/openvidu-deployment` adds `CHANGELOG.md` to the files it stages in its "Stamp release version" and "Bump package versions to next -dev" steps; until it does, `set-version` changes the changelog only when run by hand.
- openvidu.io: none.

## Decisions to confirm

- None.

## Source

3.10.0 pre-release audit, finding AU-11 (low, verified-test), introduced by earlier releases.
