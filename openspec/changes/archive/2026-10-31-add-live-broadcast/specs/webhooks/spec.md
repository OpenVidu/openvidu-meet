## MODIFIED Requirements

### Requirement: Webhook event catalogue
The server SHALL emit exactly the event types `meetingStarted`, `meetingEnded`, `participantJoined`, `participantLeft`, `participantRoleChanged`, `participantHandChanged`, `recordingStarted`, `recordingUpdated`, `recordingEnded`, `broadcastStarted`, `broadcastUpdated` and `broadcastEnded`, each triggered as its owning capability specifies. `testEvent` SHALL only be sent by `webhookTest` and is not an event type.

#### Scenario: Owner of each event
- **WHEN** a reviewer looks up when an event fires and what its payload means
- **THEN** `meetingStarted`, `meetingEnded`, `participantJoined` and `participantLeft` are specified in `meetings`
- **AND** `participantRoleChanged` in `meeting-moderation`
- **AND** `participantHandChanged` in `raise-hand`
- **AND** `recordingStarted`, `recordingUpdated` and `recordingEnded` in `recordings`
- **AND** `broadcastStarted`, `broadcastUpdated` and `broadcastEnded` in `live-broadcast`

#### Scenario: Filtering by an event type
- **WHEN** an administrator registers a webhook filtered to any subset of the twelve event types
- **THEN** the REST API accepts it, and rejects `testEvent` with `422`
