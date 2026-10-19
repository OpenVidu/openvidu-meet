# Tasks

## 1. Gate play and share by recordingPlay in the recording lists

- [x] 1.1 In the recording list component of `shared-meet-components` (`domains/recordings/components/recording-lists/`), gate the play and share actions by a per-recording `recordingPlay` check built like the existing download and delete ones (a global flag plus the set of rooms granting it), preferring one per-room permission input over a third pair of inputs if that leaves the component simpler. Verify with a Karma spec next to the component.
- [x] 1.2 Resolve `recordingPlay` per room in the console Recordings page (`domains/recordings/pages/recordings/`) from the same room member token it already decodes for download and delete, set it from the token in the room detail page (`domains/rooms/pages/room-detail/`), and from the room member context in the room recordings page (`domains/recordings/pages/room-recordings/`). Verify with the Karma spec of 1.1 and the existing console e2e in `meet-ce/frontend/e2e/console.test.ts`.
- [x] 1.3 Remove the `hasRecordingAccess` default of `true` in `recording-share-dialog.component.ts` and the blanket `hasRecordingAccess: true` passed by the console pages through `recording-actions.service.ts`, passing instead the per-recording `recordingPlay` result. Verify with `domains/recordings/services/recording-actions.service.spec.ts`.
- [x] 1.4 Add e2e cases to `meet-ce/frontend/e2e/permissions.test.ts`: a room member whose permissions hold `recordingList` but not `recordingPlay` opens the room recordings page and finds play and share disabled, and with `recordingPlay` finds them enabled (Playwright needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### UI` of `CHANGELOG.md`: "The recording lists of the console and the room recordings page offered play and share on every recording, even to a user or room member without `recordingPlay`, and those actions then failed. They are now disabled, with a tooltip, without `recordingPlay`."
- [x] 2.2 openvidu.io: none.
