## MODIFIED Requirements

### Requirement: Clean-up of stale recordings
Once per cluster every 14 minutes, the server SHALL end every recording still `starting`, `active`
or `ending` whose recording process is no longer in progress in the media server, with the final
status the media server reports or `aborted` when it no longer knows the process, reporting it like
any other end. It SHALL stop a recording whose process has not reported for 5 minutes while its room
is gone or has nobody connected, and leave alone one whose room has participants connected.

#### Scenario: Recording process lost
- **GIVEN** a recording stored as `active` whose process the media server no longer knows
- **WHEN** the clean-up runs
- **THEN** the recording is marked `aborted`

#### Scenario: Lost recording reported
- **GIVEN** a registered webhook endpoint subscribed to recording events, and a meeting with participants whose recording is stored as `active` while the media server no longer knows its process
- **WHEN** the clean-up runs
- **THEN** the endpoint receives `recordingEnded` with status `aborted`
- **AND** the participants no longer see the recording mark, and an embedded host receives `recordingStatusChanged` with `aborted`

#### Scenario: Recording waiting in an occupied room
- **GIVEN** a recording still `starting` in a meeting whose participants publish nothing
- **WHEN** the clean-up runs
- **THEN** the recording stays `starting`

#### Scenario: Two replicas
- **GIVEN** two Meet replicas sharing the deployment
- **WHEN** the clean-up time comes
- **THEN** only one replica runs it

#### Scenario: Clean-up and end notification on two replicas
- **GIVEN** two Meet replicas and a recording whose process has just ended
- **WHEN** replica A runs the clean-up while replica B processes the media server's end notification for that recording
- **THEN** the recording gets one final status and `recordingEnded` is sent once
