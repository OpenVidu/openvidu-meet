# Tasks

## 1. Read repeated query parameters

- [x] 1.1 In `extractParams` of `meet-ce/frontend/projects/shared-meet-components/src/lib/shared/utils/url.utils.ts`, return the first value of a repeated parameter (use the route's `queryParamMap.get(name)`), so every parameter is a `string`. Verify with a case in the existing unit spec of the URL utilities (repeated `language` yields one string) and one in the spec of the language guard (`?language=es&language=fr` applies `es`, no error). Run with `./meet.sh test-unit-frontend`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. The failing guard belongs to the unreleased `language` attribute (#102, #135), so no line of its own.
- [x] 2.2 openvidu.io: none.
