# Tasks

## 1. Reword the line

- [ ] 1.1 In `CHANGELOG.md` under `## 3.10.0 (unreleased)` > `### Fixed`, replace the `refreshRoomMemberToken` line by: "A room member token was renewed during a meeting without the checks that invalidate it after a change of the member's permissions, of the user's role or of the room's roles or access, or after the deletion of the member or of the user. The renewal now applies them, and the meeting renews a refused token with the credentials it joined with." Keep the reference style of the file and the em-dash-free wording.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: this is the task above; no other line.
- [ ] 2.2 openvidu.io: none.
