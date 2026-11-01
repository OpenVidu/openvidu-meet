# Tasks

## 1. Decide compact by measured fit

- [ ] 1.1 In `toolbar-media-buttons.component.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/components/toolbar/toolbar-media-buttons/`, line 141) and `services/viewport/viewport.service.ts` (lines 89 and 124-126), remove the `window.innerWidth < 768` decision and turn the toolbar compact with a `ResizeObserver` when its content's `scrollWidth` exceeds its `clientWidth`, as the status rail does for its second row. Verify with the `meet-ce/frontend/e2e/toolbar.test.ts` widths 390, 768, 820, 960 and a 700 px `<openvidu-meet>` in a 1366 px window, checking every panel button is inside the viewport (Playwright, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 Amend the existing `CHANGELOG.md` line under `## 3.10.0 (unreleased)` > `### Fixed` > `#### UI` ("A window narrower than 768 px now gets the compact toolbar a phone gets.") to say a window or embedded element too narrow for the whole toolbar gets it. No new line.
- [ ] 2.2 openvidu.io: none.
