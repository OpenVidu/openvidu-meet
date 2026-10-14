# Tasks

## 1. getUsers filter wording

- [ ] 1.1 Rewrite the descriptions of `meet-ce/backend/openapi/users/parameters/user-id-query.yaml` (exact match; combined with `name`, a user matching either is returned) and `user-name.yaml` (same combination rule, next to the existing match-mode text); verify `pnpm run lint:api` passes in `meet-ce/backend`.
- [ ] 1.2 Rewrite the TSDoc of `userId` and `name` in `MeetUserFilters` (`meet-ce/typings/src/response/user-response.ts`) with the same rule; verify `./meet.sh build-typings` passes.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no line. Documentation-only changes never get one under the root `CLAUDE.md` rules.
- [ ] 2.2 openvidu.io `next`: no page edit; regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` and verify the two parameter descriptions show the new wording.
