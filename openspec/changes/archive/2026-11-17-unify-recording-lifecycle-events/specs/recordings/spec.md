# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: recordingStatusChanged event`
- TO: `### Requirement: Embedded recording events`

## MODIFIED Requirements

### Requirement: Embedded recording events

The embedded element SHALL dispatch to the host of every participant, whoever started or stopped the
recording, `recordingStarted` the first time it learns of a recording, `recordingUpdated` on each
later change and `recordingEnded` with the final state, each carrying the recording as the webhook
of the same name does, and never an earlier state after a later one. A participant joining while a
recording is in progress SHALL receive `recordingStarted` with its current status right after
`meetingJoined`.

#### Scenario: Recording started by another participant

- **GIVEN** an embedded speaker in a meeting
- **WHEN** a moderator starts and then stops a recording
- **THEN** the speaker's host receives `recordingStarted`, `recordingUpdated` with `active` and `recordingEnded` with `complete` for the same `recordingId`

#### Scenario: Joining while recording

- **GIVEN** a meeting with an active recording
- **WHEN** an embedded participant joins
- **THEN** the host receives `meetingJoined` followed by one `recordingStarted` with `active`

#### Scenario: Current state repeated

- **GIVEN** an embedded participant whose host received `recordingUpdated` with `active` for a recording
- **WHEN** the server tells the participant again that the recording is `active`
- **THEN** the host receives no event

### Requirement: Embedded recording commands

The embedded element SHALL run `recordingStart()` and `recordingStop()` only for a local participant
holding `recordingControl` in a joined meeting, ignoring them otherwise. `recordingStop()` SHALL stop
the recording the meeting knows, waiting first for a `recordingStart()` still in flight, and do
nothing when there is none. A start the server refuses SHALL produce no `recordingStarted`.

#### Scenario: Start and stop

- **GIVEN** a joined moderator holding `recordingControl`
- **WHEN** the host calls `recordingStart()` and later `recordingStop()`
- **THEN** a recording starts and ends, and the host receives its `recordingStarted` and its `recordingEnded`

#### Scenario: Stop right after start

- **WHEN** the host calls `recordingStop()` immediately after `recordingStart()`
- **THEN** the recording that start created is stopped

#### Scenario: Participant without the permission

- **GIVEN** a joined speaker without `recordingControl`
- **WHEN** the host calls `recordingStart()`
- **THEN** no recording starts and no `recordingStarted` is dispatched

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
- **AND** the participants no longer see the recording mark, and an embedded host receives the embedded event `recordingEnded` with `aborted`

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
