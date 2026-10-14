# Room Config Specification

## Purpose

The room `config` object holds the settings every meeting of a room starts from: the meeting limits, the initial media defaults and the switch of each in-meeting feature. This capability covers the object as a whole (defaults, validation, ceilings, partial updates and when it can change), relied on by integrators through the REST API and by room managers through the console room wizard.

Surfaces: REST API (`config` of `createRoom`, `getRoomConfig`, `updateRoomConfig`, and the extra field `config` of room responses; `meet-ce/backend/openapi/rooms/schemas/meet-room-config.yaml`), console (Meeting and Recording steps of the room wizard, specified in `rooms`). The meaning of each field belongs to its feature: `maxParticipants` and `maxDurationMinutes` to `meetings`, `initialAudioActive` and `initialVideoActive` to `meeting-join`, `chat` to `meeting-chat`, `recording` to `recordings`, `virtualBackground` and `e2ee` to `meeting-media`, `captions` to `live-captions`, `raiseHand` to `raise-hand` and `reactions` to `reactions`. The appearance of the meeting is global, not per room (see `appearance`). Documented in openvidu.io `docs/meet/features/meetings/configuration.md` and `docs/meet/features/rooms/management.md`.

## Requirements

### Requirement: Default config of a new room
When `createRoom` carries no `config`, the server SHALL give the room `chat`, `virtualBackground`, `captions`, `raiseHand` and `reactions` enabled, `e2ee` disabled, `recording` enabled with layout `grid`, encoding `H264_720P_30` and no `autoStart`, `initialAudioActive` and `initialVideoActive` set to `true`, and neither `maxParticipants` nor `maxDurationMinutes`, which means no limit.

#### Scenario: Room created without config
- **WHEN** `createRoom` is called without `config`
- **THEN** `getRoomConfig` for the new room returns every feature enabled except `e2ee`
- **AND** `recording` has layout `grid`, encoding `H264_720P_30` and no `autoStart`
- **AND** `initialAudioActive` and `initialVideoActive` are `true` and no meeting limit is set

### Requirement: Partial config at creation
The server SHALL fill every top-level field missing from the `config` of a `createRoom` request with its default, and SHALL default `recording.layout` to `grid` and `recording.encoding` to `H264_720P_30` when the `recording` object sent omits them.

#### Scenario: One feature turned off at creation
- **WHEN** `createRoom` is called with `config` `{ "chat": { "enabled": false } }`
- **THEN** the room has chat disabled and every other field at its default

#### Scenario: Recording object without encoding
- **WHEN** `createRoom` is called with `config.recording` `{ "enabled": true, "layout": "speaker" }`
- **THEN** the room's recording layout is `speaker` and its encoding `H264_720P_30`

### Requirement: Feature objects carry their switch
Each feature object of a config (`chat`, `recording`, `virtualBackground`, `e2ee`, `captions`, `raiseHand`, `reactions`) SHALL carry a boolean `enabled` whenever it is sent, at creation and on update; otherwise the server SHALL answer `422` naming the field and store nothing.

#### Scenario: Missing switch
- **WHEN** `updateRoomConfig` is called with `config` `{ "recording": { "layout": "speaker" } }`
- **THEN** the server answers `422` naming `recording.enabled`

#### Scenario: Switch of the wrong type
- **WHEN** `createRoom` is called with `config.e2ee.enabled` set to the string `"true"`
- **THEN** the server answers `422` and no room is created

### Requirement: Meeting limit bounds
The server SHALL accept as `maxParticipants` an integer from 1 to 30 or `null`, and as `maxDurationMinutes` an integer from 1 to 1440 or `null`, where `null` or an absent value means no limit, and SHALL answer `422` naming the field to any other value, storing nothing.

#### Scenario: Bounds accepted
- **WHEN** `updateRoomConfig` is called with `maxParticipants` 30 and `maxDurationMinutes` 1440, or with `maxDurationMinutes` 1
- **THEN** the server answers `200` and stores those values

#### Scenario: Values out of range
- **WHEN** `updateRoomConfig` is called with `maxParticipants` 0 or 31, or with `maxDurationMinutes` 0, 1.5 or 1441
- **THEN** the server answers `422` naming the field and the stored config is unchanged

### Requirement: Initial media defaults
The server SHALL accept only booleans as `initialAudioActive` and `initialVideoActive`, answering `422` to any other value, and SHALL store `true` for each one a `createRoom` request leaves out.

#### Scenario: Initial microphone off
- **WHEN** `updateRoomConfig` is called with `initialAudioActive` `false`
- **THEN** the stored `initialAudioActive` is `false` and `initialVideoActive` keeps its value

#### Scenario: Non-boolean value
- **WHEN** `createRoom` is called with `config.initialVideoActive` set to `"no"`
- **THEN** the server answers `422`

### Requirement: Recording encoding
The server SHALL accept as `recording.encoding` either one of the encoding presets of the contract or an encoding object holding both a `video` and an `audio` part with every field the contract requires, each with a valid value, and SHALL answer `422` to anything else.

#### Scenario: Preset
- **WHEN** `createRoom` is called with `config.recording.encoding` `H264_1080P_30`
- **THEN** the room's recording encoding is `H264_1080P_30`

#### Scenario: Video settings without audio
- **WHEN** `updateRoomConfig` is called with a `recording.encoding` object that has a complete `video` part and no `audio` part
- **THEN** the server answers `422`

#### Scenario: Unknown preset
- **WHEN** `createRoom` is called with `config.recording.encoding` `H264_4K_120`
- **THEN** the server answers `422`

### Requirement: Rules across fields judge the resulting config
The server SHALL apply the rules that tie several config fields together, namely that the recording auto-start must be reachable with `maxParticipants` and that end-to-end encryption turns recording off (both specified in `recordings`), to the config that results from the request, the stored config merged with the update, so that they hold even when the fields involved arrive in different requests.

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

### Requirement: Reading the config
The server SHALL return a room's config, as a plain config object, on `getRoomConfig` to an API key, to a room member token issued for that room and to a logged-in user allowed into the room (see `room-access`), SHALL answer `403` to any other caller and `404` for a room that does not exist. Room responses SHALL carry the same object only when the extra field `config` is requested (see `rooms`).

#### Scenario: Participant reads the config of their room
- **GIVEN** a room member token issued for room A
- **WHEN** it is used to call `getRoomConfig` for room A
- **THEN** the server answers `200` with the room's config

#### Scenario: Token of another room
- **GIVEN** a room member token issued for room A
- **WHEN** it is used to call `getRoomConfig` for room B
- **THEN** the server answers `403`

#### Scenario: Unknown room
- **WHEN** `getRoomConfig` is called for a room that does not exist
- **THEN** the server answers `404`

### Requirement: Updating the config
The server SHALL apply `updateRoomConfig` only for the callers allowed to manage the room (see `rooms`), SHALL require a `config` object in the body (`422` otherwise), SHALL answer `404` for a room that does not exist, and SHALL answer `200` with the complete config that results from the update.

#### Scenario: Owner updates the config
- **GIVEN** a `room_manager` user who owns an idle room
- **WHEN** they call `updateRoomConfig` with `config` `{ "chat": { "enabled": false } }`
- **THEN** the server answers `200` with the whole config, chat disabled and every other field as before

#### Scenario: Body without config
- **WHEN** `updateRoomConfig` is called with an empty body
- **THEN** the server answers `422`

#### Scenario: Not the owner
- **GIVEN** a `room_manager` user who does not own the room
- **WHEN** they call `updateRoomConfig`
- **THEN** the server answers `403`

### Requirement: Updates merge with the stored config
The server SHALL merge an update into the stored config: every field the update leaves out, at any depth, SHALL keep its stored value, and `null` SHALL lift `maxParticipants`, `maxDurationMinutes` or `recording.autoStart`.

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

### Requirement: Config fixed during a meeting
The server SHALL answer `updateRoomConfig` with `409` and error `Room Error`, changing nothing, while the room has an active meeting, so a meeting always runs with the config it started with and a change applies from the next meeting.

#### Scenario: Update during a meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `updateRoomConfig`
- **THEN** the server answers `409` and the stored config is unchanged

#### Scenario: Update after the meeting
- **GIVEN** the meeting of that room has ended
- **WHEN** its owner calls `updateRoomConfig` with chat disabled
- **THEN** the server answers `200` and the next meeting in the room starts without chat
