## MODIFIED Requirements

### Requirement: Default config of a new room
When `createRoom` carries no `config`, the server SHALL give the room:
- `chat`, `virtualBackground`, `captions`, `raiseHand` and `reactions` enabled;
- `e2ee` and `lobby` disabled;
- `recording` enabled with layout `grid`, encoding `H264_720P_30` and no `autoStart`;
- `broadcast` disabled with no destinations, layout `grid` and encoding `H264_720P_30`;
- `initialAudioActive` and `initialVideoActive` set to `true`;
- neither `maxParticipants` nor `maxDurationMinutes`, which means no limit.

#### Scenario: Room created without config
- **WHEN** `createRoom` is called without `config`
- **THEN** `getRoomConfig` for the new room returns every feature enabled except `e2ee`, `broadcast` and `lobby`
- **AND** `recording` has layout `grid`, encoding `H264_720P_30` and no `autoStart`
- **AND** `broadcast` has no destinations, layout `grid` and encoding `H264_720P_30`
- **AND** `initialAudioActive` and `initialVideoActive` are `true` and no meeting limit is set

### Requirement: Feature objects carry their switch
Each feature object of a config (`chat`, `recording`, `virtualBackground`, `e2ee`, `captions`, `raiseHand`, `reactions`, `lobby`) SHALL carry a boolean `enabled` whenever it is sent, at creation and on update; otherwise the server SHALL answer `422` naming the field and store nothing.

#### Scenario: Missing switch
- **WHEN** `updateRoomConfig` is called with `config` `{ "recording": { "layout": "speaker" } }`
- **THEN** the server answers `422` naming `recording.enabled`

#### Scenario: Switch of the wrong type
- **WHEN** `createRoom` is called with `config.e2ee.enabled` set to the string `"true"`
- **THEN** the server answers `422` and no room is created

#### Scenario: Waiting room message without its switch
- **WHEN** `updateRoomConfig` is called with `config` `{ "lobby": { "message": "Please wait" } }`
- **THEN** the server answers `422` naming `lobby.enabled`

### Requirement: Updates merge with the stored config
The server SHALL merge an update into the stored config: every field the update leaves out, at any depth, SHALL keep its stored value, and `null` SHALL lift `maxParticipants`, `maxDurationMinutes` or `recording.autoStart`, and remove `lobby.message`. A `broadcast.destinations` list that is sent SHALL replace the stored list as a whole instead of merging with it (see `live-broadcast`).

#### Scenario: Recording switched off keeps its settings
- **GIVEN** a room whose recording uses layout `speaker`
- **WHEN** `updateRoomConfig` is called with `config` `{ "recording": { "enabled": false } }`
- **THEN** the stored recording is disabled and keeps layout `speaker` and its encoding

#### Scenario: Limit lifted with null
- **GIVEN** a room with `maxDurationMinutes` 60 and `maxParticipants` 10
- **WHEN** `updateRoomConfig` is called with `maxDurationMinutes` `null`
- **THEN** the stored `maxDurationMinutes` is `null` and `maxParticipants` stays 10

#### Scenario: Auto-start turned off
- **GIVEN** a room with `recording.autoStart` `when_first_participant_joins`
- **WHEN** `updateRoomConfig` is called with `recording` `{ "enabled": true, "autoStart": null }`
- **THEN** the stored `recording.autoStart` is `null`

#### Scenario: Destination list sent shorter
- **GIVEN** a room with three broadcast destinations
- **WHEN** `updateRoomConfig` sends `broadcast.destinations` holding only the first one, with its `id`
- **THEN** the stored list holds that destination alone

#### Scenario: Waiting room message removed
- **WHEN** `updateRoomConfig` is called with `lobby` `{ "enabled": true, "message": null }`
- **THEN** the stored waiting room has no message
