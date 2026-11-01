# Tasks

## 1. Release by stamp

- [ ] 1.1 In `meet-ce/backend/src/services/participant-name.service.ts`, make the reserve script return a stamp stored with the reservation and the release script free it only when the given stamp equals the stored one, removing the `reservedAt > ARGV[2]` comparison; the stamp is written into the token metadata by `room-member.service.ts` and read back at release instead of `extractJoinDate`. The same Lua is touched by `fix-rejoin-name-suffix-growth`: apply the two in order. Verified in `tests/integration/api/meetings/participant-name.service.test.ts` (real Redis): own departure frees the name, an earlier session's late departure does not, with no clock involved.
- [ ] 1.2 Drop the clock-dependent cases of the unit tests that the stamp replaces and keep the replay case of a departure from an older session.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. It completes the 3.10.0 line on rejoining members keeping their name (#133).
- [ ] 2.2 openvidu.io: none.
