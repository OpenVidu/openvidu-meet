# Tasks

## 1. Contain the toolbar

- [x] 1.1 In `meeting-media-setup.component.scss` (`domains/meeting/openvidu-components/components/meeting-media-setup`), change `.top-toolbar` from `position: fixed` to `position: absolute` inside the setup container, keeping its size and stacking inside the screen. Verify with a webcomponent e2e case: an element placed inside a larger page shows the setup screen and `elementFromPoint` on the host header returns the host's element; also check the standalone app screenshot of the setup screen is unchanged (needs the testapp; report as not run when unavailable). No e2e workaround for this was found to remove.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`, after the entry on the styles that crossed the shadow root: "On the device setup screen, the toolbar of `<openvidu-meet>` covered the top of the host page and took its clicks. It now stays inside the element."
- [x] 2.2 openvidu.io: none.
