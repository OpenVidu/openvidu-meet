# Tasks

## 1. Strip the heading marker

- [x] 1.1 In `set_version` of `meet.sh`, change the `sed` that handles the changelog heading so that a version without a prerelease suffix also removes `(unreleased)` from its own heading. Verify on a copy of `CHANGELOG.md`: after `set-version 3.10.0` the heading is `## 3.10.0`; after `set-version 3.11.0-dev` it stays `## 3.10.0`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line (release tooling); its headings on `main` become `## 3.10.0` and an open `## 3.11.0 (unreleased)`, by running the fixed `set-version 3.10.0` and then `set-version 3.11.0-dev`.
- [x] 2.2 openvidu.io: none.
