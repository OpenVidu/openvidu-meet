# Spec Delta

## MODIFIED Requirements

### Requirement: Default config of a new room

When `roomCreate` carries no `config`, the server SHALL give the room:

- `chat`, `virtualBackground`, `captions`, `raiseHand` and `reactions` enabled, with `chat.persist` `true`;
- `e2ee` disabled;
- `recording` enabled with layout `grid`, encoding `H264_720P_30` and no `autoStart`;
- `broadcast` disabled with no destinations, layout `grid` and encoding `H264_720P_30`;
- `initialAudioActive` and `initialVideoActive` set to `true`;
- neither `maxParticipants` nor `maxDurationMinutes`, which means no limit.

#### Scenario: Room created without config

- **WHEN** `roomCreate` is called without `config`
- **THEN** `roomGetConfig` for the new room returns every feature enabled except `e2ee` and `broadcast`
- **AND** `chat.persist` is `true`
- **AND** `recording` has layout `grid`, encoding `H264_720P_30` and no `autoStart`
- **AND** `broadcast` has no destinations, layout `grid` and encoding `H264_720P_30`
- **AND** `initialAudioActive` and `initialVideoActive` are `true` and no meeting limit is set

### Requirement: Partial config at creation

The server SHALL fill every top-level field missing from the `config` of a `roomCreate` request with its default, SHALL default `chat.persist` to `true` when the `chat` object sent omits it, SHALL default `recording.layout` to `grid` and `recording.encoding` to `H264_720P_30` when the `recording` object sent omits them, and SHALL default `broadcast.destinations` to none, `broadcast.layout` to `grid` and `broadcast.encoding` to `H264_720P_30` when the `broadcast` object sent omits them.

#### Scenario: One feature turned off at creation

- **WHEN** `roomCreate` is called with `config` `{ "chat": { "enabled": false } }`
- **THEN** the room has chat disabled and every other field at its default

#### Scenario: Chat object with its switch only

- **WHEN** `roomCreate` is called with `config.chat` `{ "enabled": true }`
- **THEN** the room's `chat.persist` is `true`

#### Scenario: Recording object without encoding

- **WHEN** `roomCreate` is called with `config.recording` `{ "enabled": true, "layout": "speaker" }`
- **THEN** the room's recording layout is `speaker` and its encoding `H264_720P_30`

#### Scenario: Broadcast object with destinations only

- **WHEN** `roomCreate` is called with `config.broadcast` holding `enabled` `true` and one destination
- **THEN** the room's broadcast layout is `grid` and its encoding `H264_720P_30`

#### Scenario: Broadcast object without its switch

- **WHEN** `roomCreate` is called with `config.broadcast` `{ "layout": "speaker" }`
- **THEN** the server answers `422` naming `broadcast.enabled` and no room is created

### Requirement: Rules across fields judge the resulting config

The server SHALL apply the rules that tie several config fields together (recording auto-start reachable with `maxParticipants`; end-to-end encryption turning recording, live broadcast, live captions and chat saving off, never back on; live broadcast needing a destination; see `recordings`, `live-broadcast`, `live-captions`, `meeting-chat`) to the config that results from the request, the stored config merged with the update, so they hold when the fields involved arrive in different requests.

#### Scenario: Unreachable auto-start split over two requests

- **GIVEN** a room whose stored `maxParticipants` is 1
- **WHEN** `roomUpdateConfig` sets only `recording.autoStart` to `when_second_participant_joins`
- **THEN** the server answers `422` with error `Room Error` and the stored config is unchanged

#### Scenario: Limit lifted in the same request

- **GIVEN** a room whose stored `maxParticipants` is 1
- **WHEN** `roomUpdateConfig` sets `maxParticipants` to `null` and `recording.autoStart` to `when_second_participant_joins`
- **THEN** the server answers `200` with both values stored

#### Scenario: Recording re-enabled on an encrypted room

- **GIVEN** a room with `e2ee` enabled
- **WHEN** `roomUpdateConfig` sets only `recording.enabled` to `true`
- **THEN** the server answers `200` and `recording.enabled` stays `false`

#### Scenario: Captions re-enabled on an encrypted room

- **GIVEN** a room with `e2ee` enabled
- **WHEN** `roomUpdateConfig` sets only `captions.enabled` to `true`
- **THEN** the server answers `200` and `captions.enabled` stays `false`

#### Scenario: Chat saving turned on in an encrypted room

- **GIVEN** a room with `e2ee` enabled
- **WHEN** `roomUpdateConfig` sets `chat` to `{ "enabled": true, "persist": true }`
- **THEN** the server answers `200` and `chat.persist` stays `false`

#### Scenario: Encryption turned on in a room that saves its chat

- **GIVEN** a room with `chat.persist` `true`
- **WHEN** `roomUpdateConfig` sets only `e2ee.enabled` to `true`
- **THEN** the server answers `200` with `chat.persist` `false`

#### Scenario: Encrypted room created without chat settings

- **WHEN** a room is created with `e2ee.enabled` `true` and no `chat` object
- **THEN** its `chat.persist` is `false`

#### Scenario: Encryption turned off again in a room that saved its chat

- **GIVEN** a room whose chat saving was turned off by turning encryption on
- **WHEN** `roomUpdateConfig` sets only `e2ee.enabled` to `false`
- **THEN** the server answers `200` and `chat.persist` stays `false`

#### Scenario: Live broadcast enabled on a room without destinations

- **GIVEN** a room with no saved broadcast destination
- **WHEN** `roomUpdateConfig` sets only `broadcast.enabled` to `true`
- **THEN** the server answers `422` with error `Broadcast Error` and the stored config is unchanged
