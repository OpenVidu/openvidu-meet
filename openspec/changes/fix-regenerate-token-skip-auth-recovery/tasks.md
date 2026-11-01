# Tasks

## 1. Skip the auth recovery on the regeneration

- [ ] 1.1 In `generateToken` of `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/room-members/services/room-member.service.ts` send `HTTP_HEADERS.SKIP_AUTH_RECOVERY: 'true'` as `refreshRoomMemberToken` does. Verify in `room-member-context.service.spec.ts` (HTTP service mocked) that the regeneration after a refused refresh carries the header, and run the library Karma suite (`./meet.sh test-unit-frontend`).
- [ ] 1.2 Add an e2e case to the existing meeting-join Playwright file: an anonymous participant whose token and refresh are refused ends on "Room access revoked", not on the login page (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. It is a fix to the unreleased fallback of #142 (the line on `refreshRoomMemberToken` already covers it).
- [ ] 2.2 openvidu.io: none.
