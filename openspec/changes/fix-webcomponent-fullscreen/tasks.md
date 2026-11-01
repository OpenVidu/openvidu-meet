# Tasks

## 1. Fullscreen inside the shadow root

- [ ] 1.1 In `document.service.ts` (`domains/meeting/openvidu-components/services/document`) resolve the stage through the root node of the calling component (`getRootNode()`) instead of `document.getElementById`; update the toolbar call at `toolbar.component.ts`. Verify with the existing unit specs of the service and toolbar (stage inside a shadow root is found).
- [ ] 1.2 In `meet-ce/frontend/webcomponent/src/app/shadow-dom/overlay-container.service.ts`, re-parent the overlay container into the fullscreen element on `fullscreenchange` and back when it ends, as the CDK's fullscreen overlay container does. Verify with a unit test of the service and a webcomponent e2e case: after a join, `#fullscreen-btn` sets `document.fullscreenElement` and a menu opened in fullscreen is visible (needs LiveKit and the testapp; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### UI`: "Fullscreen in More options did nothing in `<openvidu-meet>`. It now enters fullscreen with menus and dialogs visible."
- [ ] 2.2 openvidu.io: none.
