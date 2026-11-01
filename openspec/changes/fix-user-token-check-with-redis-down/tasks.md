# Tasks

## 1. Bound the revocation read

- [ ] 1.1 Record the decision of open product question 4 in this change and add its outcome scenario to the delta spec (`503`, or the token accepted; `logoutUser` per the second decision).
- [ ] 1.2 In `isRevoked` of `meet-ce/backend/src/services/user-token-revocation.service.ts`, race the `MGET` against a timeout of about 1 s; the access-token validator (`auth.middleware.ts`) and `logout` / `refreshToken` of `auth.controller.ts` apply the decision when it expires. Verify with cases in `meet-ce/backend/tests/unit/middlewares/auth.middleware.test.ts` that mock the Redis read as never settling and use jest fake timers (no real waits).
- [ ] 1.3 Add an integration case to `meet-ce/backend/tests/integration/api/auth/logout.test.ts` only if the suite can cut Redis; otherwise report it as not run (needs the OpenVidu local deployment).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. The revocation read is new in 3.10.0 (#130), so there is no earlier release it differs from.
- [ ] 2.2 With option A, add `503` to the affected operations in `meet-ce/backend/openapi/` and regenerate the REST API reference on openvidu.io (`./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`); with option B, openvidu.io: none.
