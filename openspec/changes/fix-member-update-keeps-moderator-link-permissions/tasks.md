# Tasks

## 1. Keep the merged role in live pushes

- [ ] 1.1 Record the anonymous role merged at join in the participant metadata (`meet-ce/backend/src/services/room-member.service.ts`, where the join metadata is built; add the field to the participant metadata type) and, in `applyMemberPermissionsToMeeting`, compute the pushed permissions with `mergePermissions(newMemberPermissions, roles[anonymousRole])` and the badge from the result. Verified in `tests/unit/services/room-member-grant.test.ts`: a signed-in speaker through the moderator secret keeps badge `moderator` and `participantKick` after an update of `recordingDownload`, and a participant without a secret is pushed as before.
- [ ] 1.2 Integration: extend `tests/integration/api/room-members/update-room-member.test.ts` with that scenario if the helpers can join with a secret and a user token (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. The bug lives in the 3.10.0 grant push (#131), so it has no previous release to differ from.
- [ ] 2.2 openvidu.io: none.
