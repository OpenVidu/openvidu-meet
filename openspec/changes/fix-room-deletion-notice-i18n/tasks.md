# Tasks

## 1. Translate the room deletion outcomes

- [ ] 1.1 In `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/rooms/services/room-deletion.service.ts` (lines 62-67 and 86), `rooms/pages/room-detail/room-detail.component.ts` (line 411) and `rooms/pages/rooms/rooms.component.ts` (line 344), map the result's `successCode` and the error code to translation keys, show those texts, and delete `removeRoomIdFromMessage`. Add the keys, with matching `{placeholders}`, to the rooms bundle in all 10 languages. Verify with a case in `meet-ce/frontend/e2e/console.test.ts`: console in Spanish, delete a room from its detail page, the notice is in Spanish (Playwright, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: amend the existing `## 3.10.0 (unreleased)` > `### Fixed` > `#### UI` line about the room detail page notices ("The notices of the console room detail page about copying a member's link, removing members and failing to load members or recordings...") to add room deletion and its error dialog, on the room detail page and the Rooms page. No new line.
- [ ] 2.2 openvidu.io: none.
