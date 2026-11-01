# Proposal

## Why

Kicking a participant asks the media server three times: once for the participant, once for the list of every participant in the room only to check again that the participant is there, and once to remove them. In a 30-participant meeting each kick transfers the whole participant list for nothing, and the same list is fetched when a member who is in the meeting loses access, is deleted, or is told that their role changed.

## What Changes

- Removing a participant from the media server sends the removal alone and reads the media server's answer: "not found" is the existing `404`, the media server being unreachable is the existing `503`.
- `participantKick` reads the participant once, to refuse recorders and agents with `404` as today, and then removes them: two calls instead of three, none of them a full list.
- Checking whether a participant is in the meeting, done before telling a user in a meeting that their role changed, reads that participant instead of listing the room.
- Kicks and role notices are accepted, refused and answered as before, with the same status codes and bodies; the only difference is the error case under "Decisions to confirm".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). `meeting-moderation` "Kick a participant" keeps holding unchanged, its scenarios "Recorder of a recording in progress" and "Live captions assistant" included.

## Impact

- REST API: `participantKick`, `updateRoomMember`, `deleteRoomMember`, `bulkDeleteRoomMembers`, `deleteUser`, `bulkDeleteUsers` and `updateUserRole`, which kick or notify a participant in a meeting, make fewer media server calls. Status codes and bodies do not change. The embedded command `participantKick` uses the same endpoint.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected. No public contract changes.
- Code: `kickParticipant` of `MeetingService` (`meet-ce/backend/src/services/meeting.service.ts`); `deleteParticipant` and `participantExists` of `LiveKitService` (`meet-ce/backend/src/services/livekit.service.ts`). `RoomMemberService.kickParticipantFromMeeting` keeps delegating to `LiveKitService.deleteParticipant`: member and user identities are never recorders or agents, so it needs no participant read.
- PRO: no seam changes; no overridable method changes its signature.
- openvidu.io: none.

## Decisions to confirm

- A media server error other than "not found" or "unreachable" while removing a participant answers `500`, where today the existence check turns it into `404`. Proposed: `500`, as for every other unexpected media server error. Alternative: keep `404`.

## Source

3.10.0 pre-release audit, finding MT-4 (low, static-high), introduced by #133.
