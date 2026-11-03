# Tasks

## 1. Seed the recording state only inside the meeting that started it

- [ ] 1.1 In `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/embedded/services/embedded-command.service.ts` (lines 195-198), call `setRecordingStarting(recordingId)` only when `meetingContextService.roomId()` still equals the room the command was sent for. Verify with a new case in `embedded-command.service.spec.ts`: the start answer arrives after `Disconnected` and the state stays empty.

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: none (the embedded recording commands are new in 3.10.0, so a fix to them has no line of its own).
- [ ] 2.2 openvidu.io: none.
