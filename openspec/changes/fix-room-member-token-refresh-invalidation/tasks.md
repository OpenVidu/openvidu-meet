# Tasks

## 1. One room member token check for the validator and the refresh

- [ ] 1.1 In `meet-ce/backend/src/middlewares/auth.middleware.ts`, extract the checks of `roomMemberTokenValidator` (signature, metadata, `rolesUpdatedAt`, demotion revocation, `permissionsUpdatedAt` and member existence, `roleUpdatedAt` and user existence) into one exported function taking the clock tolerance; the validator calls it with `0`. Verify with the existing `roomMemberTokenValidator` cases of `tests/unit/middlewares/auth.middleware.test.ts`, unchanged and passing.
- [ ] 1.2 Add unit cases for the function with `REFRESH_CLOCK_TOLERANCE_SECONDS`: a token expired 2 seconds ago is accepted, and the same token one millisecond older than `permissionsUpdatedAt`, `roleUpdatedAt`, `rolesUpdatedAt` or the demotion key is refused. Verify with `./meet.sh test-unit-backend`.
- [ ] 1.3 In `meet-ce/backend/src/services/room-member.service.ts`, make `refreshRoomMemberToken` validate the previous token with that function (keeping the `403` for another room's token and the `401` for a token that does not join) before reading the participant; drop what `getValidatedRoomMemberTokenContext` duplicates for the refresh. Verify with the existing tests of `tests/integration/api/room-members/refresh-room-member-token.test.ts` and the refresh block of `tests/integration/api/security/room-members-security.test.ts` passing.

## 2. Regression tests, one per attack path

All in `meet-ce/backend/tests/integration/api/room-members/refresh-room-member-token.test.ts`. Each joins a participant, makes the change while they stay connected, calls `refreshRoomMemberToken` with the join token issued before it and asserts `401` with message `Invalid token`, then requests a join token with the participant's credentials and the old token as `X-Room-Member-Token` and asserts it carries the new permissions under the same identity. Run with the local deployment (`pnpm run test:integration-room-members` in `meet-ce/backend`); report as not run when it is not available.

- [ ] 2.1 `updateRoomMember` denies a user member `participantKick`, keeping `meetingJoin`.
- [ ] 2.2 `updateRoomMember` changes an identified guest's `baseRole` from `moderator` to `speaker`.
- [ ] 2.3 `updateUserRole` changes an admin, in the meeting of a room they neither own nor belong to, to `room_manager`; the regeneration answers `403`.
- [ ] 2.4 A participant promoted with `participantRoleUpdate`, holding the token refreshed during the promotion, is demoted; the regeneration carries the permissions they had before the promotion.
- [ ] 2.5 Keep "should refresh token using promoted moderator permissions and badge from participant metadata" and the clock tolerance tests passing, proving the refresh still serves promotions and expiry.

## 3. Meeting client fallback

- [ ] 3.1 In `shared-meet-components` (`room-member-context.service.ts` and `meeting-event-handler.service.ts`), make the in-meeting renewal answer a `401` from `refreshRoomMemberToken` with the same join token request the "permissions updated" handler sends (meeting room secret, `joinMeeting: true`, current token as `X-Room-Member-Token`), and send the participant to "Room access revoked" only when that request is refused, or when the refresh answers `403` or `404`. Verify with new cases in the "token update in a meeting" block of `room-member-context.service.spec.ts` (refresh `401` then regeneration `200` keeps the participant and stores the new token; refresh `401` then regeneration `403` redirects; refresh `404` redirects without regenerating), run with `./meet.sh test-unit-frontend`.
- [ ] 3.2 Cover the demotion path in `meeting-event-handler.service.spec.ts`: a demotion whose refresh answers `401` regenerates and still shows the role notice. Verify with `./meet.sh test-unit-frontend`.
- [ ] 3.3 Run the moderation suites of the frontend e2e (promote and demote a participant, update a member's permissions mid-meeting) with `./meet.sh test-e2e-frontend`; report as not run when the local deployment is not available.

## 4. Contract

- [ ] 4.1 In `meet-ce/backend/openapi/room-members/internal/room-members.yaml`, extend the `refreshRoomMemberToken` description: the token in `X-Room-Member-Token` must still be accepted by the server, and one issued before a change of the room's roles or access, of the member's permissions, of the user's role or before the participant's demotion answers `401`. Verify with `pnpm run lint:api` in `meet-ce/backend`.

## 5. Advisory

- [ ] 5.1 Draft the GitHub Security Advisory text outside the repository (summary, affected releases confirmed with `git show v3.8.0:` and `v3.9.0:` of `room-member.service.ts`, patched release, severity with a CVSS 3.1 vector, the conditions and impact of the proposal's `## Severity`, workaround: remove a participant from the meeting with `participantKick` after reducing their permissions or their account role, and the note that tokens renewed before the upgrade stay valid until they expire). Verify by having the maintainers review it in the private advisory before publication.

## 6. Release surfaces

- [ ] 6.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`, worded without exploitation detail: "- `refreshRoomMemberToken` renewed room member tokens without the checks that invalidate them after a change of the member's permissions or of the user's role. It now applies them, and the meeting renews a refused token with the credentials it joined with." The demotion part needs no line of its own: the demotion revocation lands in 3.10.0 itself, whose existing `Fixed` entry already states that such a token is rejected. Verify the line follows the root `CLAUDE.md` changelog rules.
- [ ] 6.2 openvidu.io: none. No documented behavior changes.

## Workflow follow-up

- This change lives on a local branch only and is published through a private GitHub Security Advisory: never push it to the public repository before the advisory is published.
- Archive the change in the same pull request that lands the fix, then run `npx openspec validate --all --strict`.
