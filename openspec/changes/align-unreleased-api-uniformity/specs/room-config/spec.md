## MODIFIED Requirements

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

#### Scenario: Broadcast object without its switch
- **WHEN** `createRoom` is called with `config.broadcast` `{ "layout": "speaker" }`
- **THEN** the server answers `422` naming `broadcast.enabled` and no room is created

### Requirement: Feature objects carry their switch
Each feature object of a config (`chat`, `recording`, `broadcast`, `virtualBackground`, `e2ee`, `captions`, `raiseHand`, `reactions`) SHALL carry a boolean `enabled` whenever it is sent, at creation and on update; otherwise the server SHALL answer `422` naming the field and store nothing.

#### Scenario: Missing switch
- **WHEN** `updateRoomConfig` is called with `config` `{ "recording": { "layout": "speaker" } }`
- **THEN** the server answers `422` naming `recording.enabled`

#### Scenario: Switch of the wrong type
- **WHEN** `createRoom` is called with `config.e2ee.enabled` set to the string `"true"`
- **THEN** the server answers `422` and no room is created

#### Scenario: Lock message sent in the config
- **GIVEN** a locked room without a lock message
- **WHEN** `updateRoomConfig` is called with `config` `{ "locked": { "message": "Please wait" } }`
- **THEN** the room's lock is unchanged, because the lock is an access setting set with `updateRoomAccess` (see `room-access`)
