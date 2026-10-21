## MODIFIED Requirements

### Requirement: Opening and closing a room
On `updateRoomStatus` the server SHALL set a room without an active meeting to `open` or `closed` and answer `200`. While a meeting is active the room SHALL stay `active_meeting`: `closed` answers `202` and schedules `meetingEndAction` `close`, keeping a scheduled `delete`; `open` cancels a scheduled `close` and answers `200`, or `409` when `delete` is scheduled. Any other status SHALL get `422`. A closed room SHALL accept no new meeting (see `meeting-join`) and keep its recordings and members.

#### Scenario: Close an idle room
- **GIVEN** an open room without an active meeting
- **WHEN** its owner calls `updateRoomStatus` with `closed`
- **THEN** the server answers `200` and the room is `closed`
- **AND** a participant asking to join its meeting afterwards is refused with `409`
- **AND** the room's recordings can still be listed and played

#### Scenario: Reopen a closed room
- **GIVEN** a closed room
- **WHEN** an admin calls `updateRoomStatus` with `open`
- **THEN** the server answers `200` and the room is `open`

#### Scenario: Requesting active_meeting
- **WHEN** `updateRoomStatus` is called with `active_meeting`
- **THEN** the server answers `422`

#### Scenario: Close scheduled for the end of the meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `updateRoomStatus` with `closed`
- **THEN** the server answers `202` with `status` `active_meeting` and `meetingEndAction` `close`
- **AND** once the meeting ends the room is `closed` with `meetingEndAction` `none`

#### Scenario: Reopen during the meeting cancels the scheduled close
- **GIVEN** a room with an active meeting and `meetingEndAction` `close`
- **WHEN** its owner calls `updateRoomStatus` with `open`
- **THEN** the server answers `200` with `status` `active_meeting` and `meetingEndAction` `none`
- **AND** once the meeting ends the room is `open`
- **AND** no second `meetingStarted` webhook is sent for the meeting

#### Scenario: Closing keeps a scheduled deletion
- **GIVEN** a room with an active meeting that `deleteRoom` with `withMeeting=when_meeting_ends` scheduled for deletion
- **WHEN** its owner calls `updateRoomStatus` with `closed`
- **THEN** the server answers `202` with `meetingEndAction` `delete`
- **AND** the room is deleted when the meeting ends

#### Scenario: Reopening a room scheduled for deletion
- **GIVEN** a room with an active meeting and `meetingEndAction` `delete`
- **WHEN** its owner calls `updateRoomStatus` with `open`
- **THEN** the server answers `409` and the room keeps `status` `active_meeting` and `meetingEndAction` `delete`

#### Scenario: Meeting ends on another replica while the room is closed
- **GIVEN** two Meet replicas sharing MongoDB and a room with an active meeting
- **WHEN** replica A handles `updateRoomStatus` with `closed` while replica B handles the end of that meeting
- **THEN** the room ends up `closed` with `meetingEndAction` `none`, never `open` with a pending `close`
