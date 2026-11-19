# Tasks

## 1. Fullscreen inside the shadow root

- [x] 1.1 The toolbar passes the stage it sits in (`host.closest('#meeting-stage')`) to `document.service.ts` (`domains/meeting/openvidu-components/services/document`) instead of an id resolved with `document.getElementById`, and reads the fullscreen state from its own root node.
- [x] 1.2 In `meet-ce/frontend/webcomponent/src/app/shadow-dom/overlay-container.service.ts`, re-parent the overlay container into the fullscreen element of the shadow root on `fullscreenchange` and back when it ends, as the CDK's fullscreen overlay container does. Verify with a webcomponent e2e case in `room.test.ts`: after a join, `#fullscreen-btn` puts the stage in fullscreen, a menu opened in fullscreen is inside it, and the item leaves fullscreen again (needs LiveKit and the testapp; report as not run when unavailable). No unit test: jsdom has no fullscreen API, so it would only assert its own mock.

## 2. Menus after a participant leaves

- [x] 2.1 The library provides the CDK `FullscreenOverlayContainer` as its overlay container; remove `CdkOverlayContainer`, `CdkOverlayService` and their calls in the toolbar, the stream tile and the device setup screen (whose `onDeviceSelectorClicked` listened to an event no component emits). Verify with a frontend e2e case in `toolbar.test.ts`: in fullscreen, after another participant leaves, the menu opens inside the stage, and after leaving the meeting the overlay container is back on `body`.

## 3. Release surfaces

- [x] 3.1 `CHANGELOG.md`: add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration` and `#### UI` the fullscreen lines.
- [x] 3.2 openvidu.io: none.
