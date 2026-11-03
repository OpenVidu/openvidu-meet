# Tasks

## 1. Decide compact by measured fit

- [x] 1.1 In `toolbar-media-buttons.component.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/components/toolbar/toolbar-media-buttons/`, line 141) and `services/viewport/viewport.service.ts` (lines 89 and 124-126), replace the `window.innerWidth < 768` decision of the toolbar (`isMobileView`, which the recordings pages keep using) with `isCompactToolbar`: the toolbar turns compact, from a `ResizeObserver` and a `MutationObserver` as the status rail measures its second row, when its `scrollWidth` exceeds its `clientWidth`, and turns back once it is as wide as the full toolbar was (until it is measured, a window narrower than 768 px starts compact). Verify with the `meet-ce/frontend/e2e/toolbar.test.ts` widths 390, 768, 820, 960 and a 700 px `<openvidu-meet>` in a wide window (`webcomponent/tests/e2e/room.test.ts`), checking every panel button is inside the viewport (Playwright, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 Amend the existing `CHANGELOG.md` line under `## 3.10.0 (unreleased)` > `### Fixed` > `#### UI` ("A window narrower than 768 px now gets the compact toolbar a phone gets.") to say a window or embedded element too narrow for the whole toolbar gets it. No new line.
- [x] 2.2 openvidu.io: none.
