## MODIFIED Requirements

### Requirement: Rules across fields judge the resulting config
The server SHALL apply the rules that tie several config fields together, namely that the recording auto-start must be reachable with `maxParticipants` and that end-to-end encryption turns recording and live captions off (specified in `recordings` and `live-captions`), to the config that results from the request, the stored config merged with the update, so that they hold even when the fields involved arrive in different requests.

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

#### Scenario: Captions re-enabled on an encrypted room
- **GIVEN** a room with `e2ee` enabled
- **WHEN** `updateRoomConfig` sets only `captions.enabled` to `true`
- **THEN** the server answers `200` and `captions.enabled` stays `false`
