# Tasks

## 1. Strip the heading marker

- [ ] 1.1 In `set_version` of `meet.sh`, change the `sed` that handles the changelog heading so that a version without a prerelease suffix also removes `(unreleased)` from its own heading. Verify on a copy of `CHANGELOG.md`: after `set-version 3.10.0` the heading is `## 3.10.0`; after `set-version 3.11.0-dev` it stays `## 3.10.0`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none (release tooling).
- [ ] 2.2 openvidu.io: none.
