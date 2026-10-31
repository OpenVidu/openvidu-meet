# Tasks

## 1. Conditional deletion writes

- [ ] 1.1 In `deleteMeetRoom` of `meet-ce/backend/src/services/room.service.ts`, replace the unconditional `updatePartial(roomId, { meetingEndAction })` by `scheduleMeetingEndAction` (filtered on `active_meeting`; `delete` may replace `close`) and, when it returns `null`, decide again from a fresh read. Verified in `tests/unit/services/room.service.test.ts`: a `null` from the repository leads to the idle branch.
- [ ] 1.2 Make the idle branches (`status: closed`, plain delete) conditional on `status != active_meeting` in `meet-ce/backend/src/repositories/room.repository.ts`, deciding again on a miss with the same retry shape as `updateMeetRoomStatus`. Verified in the same unit file with a repository that reports an activated meeting.
- [ ] 1.3 Check that `bulkDeleteMeetRooms` and the expired-rooms task of `room-scheduled-tasks.service.ts` go through the same path; keep `tests/integration/api/rooms/delete-room.test.ts` and `bulk-delete-rooms.test.ts` passing (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`: "[`deleteRoom`][3.9-delete-room] with `withMeeting=when_meeting_ends` could leave the room open with a pending deletion when the meeting ended at the same moment, and the next meeting then deleted the room and its recordings. The deletion is now decided against the room's state when it is written." Add the reference `[3.9-delete-room]` (`#/operations/deleteRoom`) at the end of the file.
- [ ] 2.2 openvidu.io: none.
