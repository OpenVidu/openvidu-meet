# Tasks

## 1. One back button rule for embedded modes

- [x] 1.1 In `MeetingLobbyService.setBackButtonText()` (`domains/meeting/services/meeting-lobby.service.ts`), decide "standalone" with `isEmbeddedMode()` instead of `isWebcomponentMode()`, as `EndMeetingComponent` does; verify with cases in `domains/meeting/services/meeting-lobby.service.spec.ts` (iframe signed in, iframe anonymous, iframe with redirect, standalone signed in, standalone anonymous) run by `./meet.sh test-unit-frontend`.
- [x] 1.2 Once `fix-iframe-bridge-starts-with-app` is applied, in `ErrorComponent.setBackButtonText()` (`shared/components/error/error.component.ts`) show the button with `isEmbeddedMode()` instead of `isWebcomponentMode()`, and drop the comment that explains the iframe exception; verify with cases in a co-located `error.component.spec.ts` (iframe without redirect shows `Accept`, standalone anonymous shows none, standalone signed in shows `Back to Console`) run by `./meet.sh test-unit-frontend`.
- [x] 1.3 Add the iframe scenarios of the delta spec (anonymous join screen, access error screen; the signed-in join screen is covered by the lobby unit cases of 1.1, as the webcomponent e2e helpers cannot sign a user in) to `meet-ce/frontend/webcomponent/tests/e2e/events.test.ts`, on both transports next to the existing `embeddedCloseRequested` cases (iframe transport); run `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.

- [x] 1.4 Apply the same rule to the recording view (`domains/recordings/pages/view-recording/view-recording.component.ts`, `shouldShowBackButton()` with `isEmbeddedMode()`): a recording opened in an iframe by its link had no button without a leave redirect, so `embeddedCloseRequested` could not be emitted from it. Verify with the recording case of task 1.4 of `fix-iframe-bridge-starts-with-app`.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "On the join screen of a meeting in an iframe without `leave-redirect-url`, a signed-in user got a **Back to Rooms** button that only emitted `embeddedCloseRequested`, and an anonymous participant got none. The iframe's access error screens, and a recording opened in an iframe by its link, offered no button either. The join, error and recording screens of an iframe now always offer one that emits `embeddedCloseRequested`, as its end screen does."
- [x] 2.2 openvidu.io: none. No page describes the join screen's back button per embedding mode, and the embedded API reference does not change, so nothing is regenerated.
