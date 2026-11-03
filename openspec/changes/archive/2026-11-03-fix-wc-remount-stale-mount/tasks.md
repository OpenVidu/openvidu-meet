# Tasks

## 1. Stop the outgoing mount from navigating

- [x] 1.1 In `meet-ce/frontend/webcomponent/src/app/app.ts`, make the effect that syncs the home route do nothing when the instance is no longer `App.activeMount`. Verify with the existing remount e2e test of `attributes.test.ts` ("should not send the host page to an earlier entry's redirect from a new webcomponent without one"), repeated: it failed in 5 of 40 runs before and passed 70 of 70 after.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`: "Replacing an `<openvidu-meet>` element with a new one on another room could end on an error dialog instead of the new room's join screen. The new element now enters its room undisturbed."
- [x] 2.2 openvidu.io: none.
