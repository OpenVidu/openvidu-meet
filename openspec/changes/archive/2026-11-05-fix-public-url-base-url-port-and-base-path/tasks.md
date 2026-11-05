# Tasks

## 1. Fix the URL builders

- [x] 1.1 `getBaseUrl()` in `meet-ce/backend/src/utils/url.utils.ts`: remove a default port only when it is the whole
  port of the URL. Covered by `tests/unit/utils/url.utils.test.ts` (`:8080`, `:8000`, `:4430`, `:443` on `http`).
- [x] 1.2 `stripBasePath()`: strip the base path only on a segment boundary. Covered by the same file (`/r` vs `/room`).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: two lines under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Deployment`.
- [x] 2.2 openvidu.io: none.
