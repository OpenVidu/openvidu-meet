# Tasks

## 1. Keep the secret and key with their room

- [ ] 1.1 Store the room secret and the E2EE data in session storage together with the room id (`shared/services/session-storage.service.ts`), and make `MeetingContextService.loadRoomSecretFromStorage()` and `loadE2eeKeyFromStorage()` restore them only for the current room id, clearing the in-memory value otherwise; the meeting, recording and room-recordings entry services already set the room id first. Verify with cases in `shared/services/browser-storage.service.spec.ts` or the existing context coverage, and in `domains/meeting/services/meeting-entry.service.spec.ts` (same room restores, other room starts empty, value in the old shape is ignored), run by `./meet.sh test-unit-frontend`.
- [ ] 1.2 Add the scenario "Another room in the same tab" to `meet-ce/frontend/e2e/access.test.ts` and "Element switched to another room" to `meet-ce/frontend/webcomponent/tests/e2e/room.test.ts`; run `./meet.sh test-e2e-frontend` and `./meet.sh test-e2e-webcomponent` against the local deployment, or report them as not run when the deployment is unavailable.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "A browser tab, or an `<openvidu-meet>` element, that had entered a room with a secret or an encryption key reused them for any other room entered without them, so a user access link opened afterwards showed the \"Invalid link\" error screen. They are now kept only for the room they were given for."
- [ ] 2.2 openvidu.io: none. No page describes how the tab keeps the secret or the key, and the embedded API reference does not change, so nothing is regenerated.
