## MODIFIED Requirements

### Requirement: Default access settings
The server SHALL create a room with the anonymous `moderator`, `speaker` and `recording` links enabled, user access disabled and the room unlocked with no lock message (see `locked-room`), except for each setting that the `access` object of `createRoom` sets.

#### Scenario: Defaults
- **WHEN** `createRoom` is called without `access`
- **THEN** `access.anonymous.moderator.enabled`, `access.anonymous.speaker.enabled` and `access.anonymous.recording.enabled` are `true`
- **AND** `access.user.enabled` and `access.lock.enabled` are `false` and `access.lock` has no `message`

#### Scenario: Anonymous moderator link disabled at creation
- **WHEN** `createRoom` is called with `access.anonymous.moderator.enabled` `false`
- **THEN** the room's anonymous moderator link is disabled and every other setting keeps its default

#### Scenario: Room created locked
- **WHEN** `createRoom` is called with `access.lock` `{ "enabled": true, "message": "Please wait" }`
- **THEN** the room is locked with that message and every other setting keeps its default

### Requirement: Disclosure of the anonymous links
In every room returned by `getRoom` and `getRooms`, the server SHALL include the URL of an anonymous link only when the caller holds `roomShareAccessLinks` in that room and every permission the link grants: the `moderator` role's for the moderator link, the `speaker` role's for the speaker link, and `recordingList`, `recordingPlay` and `recordingDownload` for the recordings link. It SHALL always include `access.user.url`, every `enabled` flag and `access.lock.message`.

#### Scenario: Speaker without the permission
- **GIVEN** a room whose `speaker` role lacks `roomShareAccessLinks`
- **WHEN** a participant who entered through the speaker link calls `getRoom` with their room member token
- **THEN** the room carries no `url` under `access.anonymous` but carries `access.user.url` and `access.lock`

#### Scenario: Moderator allowed to share
- **GIVEN** a room with the default role permissions
- **WHEN** a participant who entered through the moderator link calls `getRoom` with their room member token
- **THEN** the room carries the URLs of its moderator, speaker and recordings links

#### Scenario: Speaker allowed to share
- **GIVEN** a room whose `speaker` role holds `roomShareAccessLinks` and otherwise the default speaker permissions
- **WHEN** a participant who entered through the speaker link calls `getRoom` with their room member token
- **THEN** the room carries the URLs of its speaker and recordings links
- **AND** it carries no `access.anonymous.moderator.url`, because the moderator link grants permissions they lack, `participantKick` among them

#### Scenario: Member allowed to share
- **GIVEN** a room member with base role `moderator` whose custom permissions deny `participantKick` and keep `roomShareAccessLinks`
- **WHEN** they list their rooms with `getRooms`
- **THEN** that room carries no `access.anonymous.moderator.url`, because the moderator role grants `participantKick`
- **AND** it carries the URL of every other link whose permissions they all hold

#### Scenario: Owner
- **GIVEN** a room whose `moderator` role lacks `roomShareAccessLinks`
- **WHEN** its owner, an `admin` user or an API key calls `getRoom`
- **THEN** the room carries the URLs of its three anonymous links, because they hold every permission

### Requirement: Updating the room access
`updateRoomAccess` SHALL be applied only for the callers allowed to manage the room (see `rooms`), SHALL merge the given settings into the stored ones and answer `200` with the room's complete `access`, URLs included, and SHALL answer `409` while the room has an active meeting, decided by the write itself so a meeting that starts meanwhile keeps the stored settings, `404` for a room that does not exist and `422` when `access` is missing, a flag is not a boolean, `access.lock` is sent without its `enabled` switch or `access.lock.message` is longer than 500 characters. `access.lock.message` set to `null` SHALL remove the stored message. Room member tokens issued before the update stop being accepted (see `authentication`).

#### Scenario: Enable user access
- **GIVEN** an idle room with user access disabled
- **WHEN** its owner calls `updateRoomAccess` with `access.user.enabled` `true`
- **THEN** the server answers `200` with `access.user.enabled` `true` and the anonymous flags and the lock unchanged

#### Scenario: Access update during a meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `updateRoomAccess`
- **THEN** the server answers `409` and the access settings are unchanged

#### Scenario: Lock message without its switch
- **WHEN** `updateRoomAccess` is called with `access` `{ "lock": { "message": "Please wait" } }`
- **THEN** the server answers `422` naming `lock.enabled`

#### Scenario: Lock message removed
- **GIVEN** a locked room with a lock message
- **WHEN** `updateRoomAccess` is called with `access.lock` `{ "enabled": true, "message": null }`
- **THEN** the room stays locked and `access.lock` has no message
