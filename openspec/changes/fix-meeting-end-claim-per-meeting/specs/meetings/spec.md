## ADDED Requirements

### Requirement: Each meeting is started and ended on its own
The server SHALL send `meetingStarted` and `meetingEnded` once for each meeting the media server reports, even when the start of a meeting is processed before the end of the one before it, and the end of a meeting SHALL release the participant names and clean up the state of that meeting even when its start was never processed. An end SHALL NOT end a meeting that started after it.

#### Scenario: Start processed before the previous end
- **GIVEN** two Meet replicas and a room whose meeting A has finished at the media server
- **WHEN** the start of meeting B is processed before the end of meeting A
- **THEN** `meetingEnded` is sent for A and `meetingStarted` for B
- **AND** the room stays `active_meeting` while B runs and B's end is reported later

#### Scenario: Start never processed
- **GIVEN** a meeting whose start was lost and whose participants reserved names
- **WHEN** its end is processed
- **THEN** its name reservations are released

#### Scenario: Reconciliation meets a meeting that just started
- **GIVEN** a room the reconciliation found without a meeting at the media server
- **WHEN** a new meeting starts before the reconciliation claims the end
- **THEN** the new meeting is not ended
