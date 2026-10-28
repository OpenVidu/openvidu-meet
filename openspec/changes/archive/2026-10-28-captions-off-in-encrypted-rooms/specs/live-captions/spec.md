## ADDED Requirements

### Requirement: Live captions and end-to-end encryption exclude each other
The server SHALL store `captions.enabled` as `false` whenever the room's `e2ee.enabled` is `true`, both when the room is created and on every config update, so the meeting of an encrypted room never offers live captions. Rooms stored with both enabled before this rule SHALL be turned to captions off when Meet is upgraded.

#### Scenario: Room created with both features enabled
- **WHEN** a room is created with `captions.enabled` and `e2ee.enabled` both `true`
- **THEN** the stored room config has `captions.enabled` set to `false`
- **AND** its meeting shows no captions button

#### Scenario: Encryption enabled later on a room with captions
- **GIVEN** a room with `captions.enabled` set to `true`
- **WHEN** its config is updated with only `e2ee.enabled` set to `true`
- **THEN** the stored room config has `captions.enabled` set to `false`

#### Scenario: Captions re-enabled on an encrypted room
- **GIVEN** a room with `e2ee.enabled` set to `true`
- **WHEN** `updateRoomConfig` sets only `captions.enabled` to `true`
- **THEN** the server answers `200` and `captions.enabled` stays `false`

#### Scenario: Encrypted room stored before the upgrade
- **GIVEN** a room stored with `e2ee.enabled` and `captions.enabled` both `true` by an earlier Meet version
- **WHEN** Meet is upgraded and its config is read with `getRoomConfig`
- **THEN** `captions.enabled` is `false`
