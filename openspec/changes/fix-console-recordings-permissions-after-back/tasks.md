# Tasks

## 1. One cached room permissions value

- [ ] 1.1 In `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/recordings/pages/recordings/recordings.component.ts` (lines 29-35, 107-114, 183-223) replace the three Maps, three Set signals and three inputs with one `roomPermissions` signal (room id to permissions), cached and restored whole on back navigation and extended when a page loads. Replace `deletableRoomIds`, `downloadableRoomIds` and `playableRoomIds` of `RecordingListsComponent` with one input. Verify with a case in `meet-ce/frontend/e2e/recordings.test.ts`: a `room_manager` opens a recording, goes back, loads page 2, and the rows of page 1 keep play, share, download and delete enabled (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### UI` of `CHANGELOG.md`: "The console Recordings page disabled the download buttons of a non-admin user after going back from a recording, and play, share and delete on earlier rows after loading more. They now keep their permissions."
- [ ] 2.2 openvidu.io: none.
