# Tasks

## 1. getUsers filter wording

- [x] 1.1 Rewrite the descriptions of `meet-ce/backend/openapi/users/parameters/user-id-query.yaml` (exact match; combined with `name`, a user matching either is returned) and `user-name.yaml` (same combination rule, next to the existing match-mode text); verify `pnpm run lint:api` passes in `meet-ce/backend`. Redocly lint: both APIs valid, no new problem.
- [x] 1.2 Rewrite the TSDoc of `userId` and `name` in `MeetUserFilters` (`meet-ce/typings/src/response/user-response.ts`) with the same rule; verify `./meet.sh build-typings` passes. Verified with `tsc -p tsconfig.build.json` in the typings package, run directly instead of `./meet.sh`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. Documentation-only changes never get one under the root `CLAUDE.md` rules.
- [x] 2.2 openvidu.io `next`: no page edit; regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` and verify the two parameter descriptions show the new wording. Regenerated from `feat/live-broadcast` at the commit last published on `next` (bd30724e6) plus these edits, because the page on `next` already carries the live broadcast API, which `main` does not have yet; the diff against the published page holds only this batch of wording changes.
