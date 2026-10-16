# Tasks

## 1. Analytics contract text

- [x] 1.1 In `meet-ce/backend/openapi/analytics/analytics.yaml`, point `403` at `../shared/responses/errors/forbidden.yaml`; verify against `tests/integration/api/security/analytics-security.test.ts`, which expects `403` for a `room_manager`, and run `pnpm run lint:api` in `meet-ce/backend`. Redocly lint: both APIs valid, no new problem.
- [x] 1.2 Reword the four property descriptions of `meet-ce/backend/openapi/analytics/schemas/meet-analytics.yaml` and the TSDoc of `MeetAnalytics` in `meet-ce/typings/src/analytics.ts` to the current counts (rooms and recordings that exist, rooms with an active meeting, existing recordings with status `complete`); verify against `tests/integration/api/analytics/get-analytics.test.ts` and build the typings with `./meet.sh build-typings`. Verified with `tsc -p tsconfig.build.json` in the typings package, run directly instead of `./meet.sh`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. The change corrects the OpenAPI and the TSDoc to describe behavior the server already had (root `CLAUDE.md`, Changelog).
- [x] 2.2 openvidu.io: none. Neither the internal API nor `MeetAnalytics` is published there.
