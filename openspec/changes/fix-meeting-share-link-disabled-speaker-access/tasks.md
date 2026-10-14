# Tasks

## 1. Offer the link only while enabled

- [ ] 1.1 In `room-access-link.service.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/`), set the speaker links only when `access.anonymous.speaker.enabled` is `true`, and gate the toolbar copy button (`meeting-toolbar-extra-buttons.component.ts`) and the invite panel (`meeting-invite-panel.component.ts`) on the link being available, as the join screen and the overlay already are; verify with a case in `meeting-lobby.service.spec.ts` (no share link when the room's speaker access is disabled) and `./meet.sh test-unit-frontend`.
- [ ] 1.2 Add to the "In-meeting share points" block of `meet-ce/frontend/e2e/share-link.test.ts` a room with `access.anonymous.speaker.enabled` `false`: a moderator sees no share link on the join screen, no toolbar button, no invite panel entry and the waiting notice while alone; run `./meet.sh test-e2e-frontend` (needs the local deployment; report it as not run otherwise).

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "In a room whose anonymous speaker access is disabled, the meeting still offered the anonymous speaker link to share, a link every recipient was refused with. The meeting no longer offers it."
- [ ] 2.2 openvidu.io: none.
