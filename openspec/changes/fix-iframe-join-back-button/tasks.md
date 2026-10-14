# Tasks

## 1. One back button rule for embedded modes

- [ ] 1.1 In `MeetingLobbyService.setBackButtonText()` (`domains/meeting/services/meeting-lobby.service.ts`), decide "standalone" with `isEmbeddedMode()` instead of `isWebcomponentMode()`, as `EndMeetingComponent` does; verify with cases in `domains/meeting/services/meeting-lobby.service.spec.ts` (iframe signed in, iframe anonymous, iframe with redirect, standalone signed in, standalone anonymous) run by `./meet.sh test-unit-frontend`.
- [ ] 1.2 Add the two iframe scenarios of the delta spec to `meet-ce/frontend/webcomponent/tests/e2e/events.test.ts` next to the existing `embeddedCloseRequested` cases (iframe transport); run `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "On the join screen of a meeting in an iframe without `leave-redirect-url`, a signed-in user got a **Back to Rooms** button that only emitted `embeddedCloseRequested`, and an anonymous participant got none. The iframe's join screen now always offers a **Back** button that emits `embeddedCloseRequested`, as its end screen does."
- [ ] 2.2 openvidu.io: none. No page describes the join screen's back button per embedding mode, and the embedded API reference does not change, so nothing is regenerated.
