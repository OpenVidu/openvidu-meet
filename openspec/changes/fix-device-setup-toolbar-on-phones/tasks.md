# Tasks

## 1. Position the device setup screen against its own element

- [ ] 1.1 `meeting-media-setup.component.scss`: `:host` gets `position: relative`, so the absolutely positioned toolbar and loading overlay stay in the element when `.prejoin-container.mobile` resets its own positioning with `all: unset`; drop its invalid `display: content`, which the browser ignored.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. The existing Fixed line for the device setup toolbar of `<openvidu-meet>` now holds on phones too.
- [ ] 2.2 openvidu.io: none.
