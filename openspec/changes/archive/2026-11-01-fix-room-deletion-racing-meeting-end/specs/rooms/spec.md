## ADDED Requirements

### Requirement: A deletion follows the meeting state it ends up facing
`deleteRoom`, `bulkDeleteRooms` and the automatic deletion of expired rooms SHALL act on the room's state at the moment they write: a meeting that ended while the deletion was decided SHALL leave the room deleted or closed as an idle room, never open with a pending deletion, and a meeting that started meanwhile SHALL make the deletion follow the policy for an active meeting instead of deleting the room under it.

#### Scenario: Meeting ends while deletion is scheduled
- **GIVEN** a room with an active meeting whose last participant leaves
- **WHEN** `deleteRoom` with `withMeeting=when_meeting_ends` is processed just after the meeting ended
- **THEN** the room is deleted and does not stay `open` with `meetingEndAction` `delete`
- **AND** a meeting held later in a room with the same id is not affected

#### Scenario: Meeting starts while an idle room is deleted
- **GIVEN** an idle room whose first participant is joining
- **WHEN** `deleteRoom` without policies is processed just after the meeting started
- **THEN** the server answers `409` with error `room_has_active_meeting` and the meeting goes on

#### Scenario: Deletion and meeting end on different replicas
- **GIVEN** two Meet replicas, one receiving `deleteRoom` and the other the end of the meeting
- **WHEN** both run at the same time
- **THEN** the room ends deleted exactly once, with its recordings handled as `withRecordings` says
