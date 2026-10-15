## MODIFIED Requirements

### Requirement: Default config of a new room
When `createRoom` carries no `config`, the server SHALL give the room `chat`, `virtualBackground`, `captions`, `raiseHand` and `reactions` enabled, `e2ee` disabled, `recording` enabled with layout `grid`, encoding `H264_720P_30` and no `autoStart`, `broadcast` disabled with no destinations, layout `grid` and encoding `H264_720P_30`, `initialAudioActive` and `initialVideoActive` set to `true`, and neither `maxParticipants` nor `maxDurationMinutes`, which means no limit.

#### Scenario: Room created without config
- **WHEN** `createRoom` is called without `config`
- **THEN** `getRoomConfig` for the new room returns every feature enabled except `e2ee` and `broadcast`
- **AND** `recording` has layout `grid`, encoding `H264_720P_30` and no `autoStart`
- **AND** `broadcast` has no destinations, layout `grid` and encoding `H264_720P_30`
- **AND** `initialAudioActive` and `initialVideoActive` are `true` and no meeting limit is set

### Requirement: Partial config at creation
The server SHALL fill every top-level field missing from the `config` of a `createRoom` request with its default, SHALL default `recording.layout` to `grid` and `recording.encoding` to `H264_720P_30` when the `recording` object sent omits them, and SHALL default `broadcast.destinations` to none, `broadcast.layout` to `grid` and `broadcast.encoding` to `H264_720P_30` when the `broadcast` object sent omits them.

#### Scenario: One feature turned off at creation
- **WHEN** `createRoom` is called with `config` `{ "chat": { "enabled": false } }`
- **THEN** the room has chat disabled and every other field at its default

#### Scenario: Recording object without encoding
- **WHEN** `createRoom` is called with `config.recording` `{ "enabled": true, "layout": "speaker" }`
- **THEN** the room's recording layout is `speaker` and its encoding `H264_720P_30`

#### Scenario: Broadcast object with destinations only
- **WHEN** `createRoom` is called with `config.broadcast` holding `enabled` `true` and one destination
- **THEN** the room's broadcast layout is `grid` and its encoding `H264_720P_30`

### Requirement: Feature objects carry their switch
Each feature object of a config (`chat`, `recording`, `broadcast`, `virtualBackground`, `e2ee`, `captions`, `raiseHand`, `reactions`) SHALL carry a boolean `enabled` whenever it is sent, at creation and on update; otherwise the server SHALL answer `422` naming the field and store nothing.

#### Scenario: Missing switch
- **WHEN** `updateRoomConfig` is called with `config` `{ "recording": { "layout": "speaker" } }`
- **THEN** the server answers `422` naming `recording.enabled`

#### Scenario: Broadcast without its switch
- **WHEN** `updateRoomConfig` is called with `config` `{ "broadcast": { "layout": "speaker" } }`
- **THEN** the server answers `422` naming `broadcast.enabled`

#### Scenario: Switch of the wrong type
- **WHEN** `createRoom` is called with `config.e2ee.enabled` set to the string `"true"`
- **THEN** the server answers `422` and no room is created

### Requirement: Rules across fields judge the resulting config
The server SHALL apply the rules that tie several config fields together (in `recordings`, the auto-start reachable with `maxParticipants` and encryption turning recording off; in `live-broadcast`, live broadcast needing a destination and turned off by encryption) to the config that results from the request, the stored config merged with the update, so that they hold even when the fields involved arrive in different requests.

#### Scenario: Unreachable auto-start split over two requests
- **GIVEN** a room whose stored `maxParticipants` is 1
- **WHEN** `updateRoomConfig` sets only `recording.autoStart` to `when_second_participant_joins`
- **THEN** the server answers `422` with error `Room Error` and the stored config is unchanged

#### Scenario: Limit lifted in the same request
- **GIVEN** a room whose stored `maxParticipants` is 1
- **WHEN** `updateRoomConfig` sets `maxParticipants` to `null` and `recording.autoStart` to `when_second_participant_joins`
- **THEN** the server answers `200` with both values stored

#### Scenario: Recording re-enabled on an encrypted room
- **GIVEN** a room with `e2ee` enabled
- **WHEN** `updateRoomConfig` sets only `recording.enabled` to `true`
- **THEN** the server answers `200` and `recording.enabled` stays `false`

#### Scenario: Live broadcast enabled on a room without destinations
- **GIVEN** a room with no saved broadcast destination
- **WHEN** `updateRoomConfig` sets only `broadcast.enabled` to `true`
- **THEN** the server answers `422` with error `Broadcast Error` and the stored config is unchanged

### Requirement: Updates merge with the stored config
The server SHALL merge an update into the stored config: every field the update leaves out, at any depth, SHALL keep its stored value, and `null` SHALL lift `maxParticipants`, `maxDurationMinutes` or `recording.autoStart`. A `broadcast.destinations` list that is sent SHALL replace the stored list as a whole instead of merging with it (see `live-broadcast`).

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
