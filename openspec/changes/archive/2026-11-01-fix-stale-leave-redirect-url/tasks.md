# Tasks

## 1. Tie the redirect to its entry

- [x] 1.1 In `leave-redirect.service.ts` (`shared/services`) of `shared-meet-components`, store the redirect with its room id (as the room secret is) in the tab's storage and ignore a stored value of another room. In `domains/meeting/services/meeting-entry.service.ts`, call the redirect handling on every entry so an entry without `leave-redirect-url` clears the in-memory and the stored value in the embedded modes. Verify with unit specs of both services (no redirect after an entry without the parameter, redirect kept for the same room after a reload, ignored for another room).
- [x] 1.2 Add webcomponent and iframe cases (remount on room B without the attribute, iframe replaced) to the existing embedded e2e suites; report as not run when the testapp is unavailable.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`: "A `leave-redirect-url` stayed in effect for the next element or iframe of the same page, which then sent the host page to the earlier URL on Back. Each entry now uses only its own."
- [x] 2.2 openvidu.io: none.
