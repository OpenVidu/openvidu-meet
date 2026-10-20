# Tasks

## 1. One back button rule for embedded modes

- [ ] 1.1 In `MeetingLobbyService.setBackButtonText()` (`domains/meeting/services/meeting-lobby.service.ts`), decide "standalone" with `isEmbeddedMode()` instead of `isWebcomponentMode()`, as `EndMeetingComponent` does; verify with cases in `domains/meeting/services/meeting-lobby.service.spec.ts` (iframe signed in, iframe anonymous, iframe with redirect, standalone signed in, standalone anonymous) run by `./meet.sh test-unit-frontend`.
- [ ] 1.2 Once `fix-iframe-bridge-starts-with-app` is applied, in `ErrorComponent.setBackButtonText()` (`shared/components/error/error.component.ts`) show the button with `isEmbeddedMode()` instead of `isWebcomponentMode()`, and drop the comment that explains the iframe exception; verify with cases in a co-located `error.component.spec.ts` (iframe without redirect shows `Accept`, standalone anonymous shows none, standalone signed in shows `Back to Console`) run by `./meet.sh test-unit-frontend`.
- [ ] 1.3 Add the three iframe scenarios of the delta spec (signed-in and anonymous join screen, access error screen) to `meet-ce/frontend/webcomponent/tests/e2e/events.test.ts` next to the existing `embeddedCloseRequested` cases (iframe transport); run `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "On the join screen of a meeting in an iframe without `leave-redirect-url`, a signed-in user got a **Back to Rooms** button that only emitted `embeddedCloseRequested`, and an anonymous participant got none. The iframe's access error screens offered no button either. The join and error screens of an iframe now always offer one that emits `embeddedCloseRequested`, as its end screen does."
- [ ] 2.2 openvidu.io: none. No page describes the join screen's back button per embedding mode, and the embedded API reference does not change, so nothing is regenerated.
