# Tasks

## 1. A reaction limit per participant

- [ ] 1.1 Apply `fix-rate-limits-across-replicas` first (its Redis-backed store and the `RATE_LIMIT` Redis key prefix), or, if the maintainer chose to land this change first, keep the in-memory store and record it in that change's tasks so it moves this limiter to Redis too.
- [ ] 1.2 Add `reactionLimiter` to `meet-ce/backend/src/middlewares/rate-limit.middleware.ts`, through `withTestBypass`: one-second window, limit 2, `keyGenerator` returning `<roomId>:<participantIdentity>` from `RequestSessionService.getParticipantIdentity()` and `req.params.roomId`, its own store instance with prefix `reaction`, and the `429` message "Too many reactions, please try again later".
- [ ] 1.3 In `meet-ce/backend/src/routes/meeting.routes.ts`, remove `internalMeetingRouter.use(apiLimiter)` and put `reactionLimiter` in the reactions route right after `withAuth(roomMemberTokenValidator)`; update the route comment if it no longer reads true.
- [ ] 1.4 Verify in `meet-ce/backend/tests/unit/middlewares/rate-limit.middleware.test.ts` (created by `fix-rate-limits-across-replicas`), with `NODE_ENV` set to `production` for the case: two limiter instances over one shared fake Redis answer `429` to the third reaction of one participant within a second spread over both (scenario "Reactions spread over two replicas"), a second participant at the same address is not refused, and the reaction requests leave the `apiLimiter` count of that address untouched (scenario "Reactions do not count toward the API limit"). Run `./meet.sh test-unit-backend` and `./meet.sh lint-backend`; the integration suite runs with `NODE_ENV` `test`, where no limit applies.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. Reactions are new in 3.10.0 and their entry does not describe rate limits.
- [ ] 2.2 In the `participantReactionSend` description of `meet-ce/backend/openapi/meetings/internal/meetings.yaml`, say that reactions are limited per participant (its `429` response is already listed). The internal API is not published on openvidu.io.
- [ ] 2.3 openvidu.io: none. No page documents rate limits per endpoint.
