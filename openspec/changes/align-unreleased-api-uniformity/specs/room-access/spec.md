## MODIFIED Requirements

### Requirement: Access links of a room
The server SHALL give every room, when it is created, four access URLs that stay the same for the room's whole life: an anonymous link for the `moderator` role, one for the `speaker` role and one for the room's recordings page, each carrying its own random `secret`, and the user access link `/room/{roomId}`, which carries no secret.

#### Scenario: Links of a new room
- **WHEN** a room is created
- **THEN** `access.anonymous.moderator.url` and `access.anonymous.speaker.url` point to the room with two different `secret` values
- **AND** `access.anonymous.recording.url` points to the room's recordings page with a third `secret`
- **AND** `access.user.url` points to the room without any `secret`

#### Scenario: Links survive access changes
- **GIVEN** a room whose anonymous speaker link is disabled and later enabled again with `roomUpdateAccess`
- **WHEN** the room is read
- **THEN** every access URL is the same as when the room was created

### Requirement: Default access settings
The server SHALL create a room with the anonymous `moderator`, `speaker` and `recording` links enabled, user access disabled and the room unlocked with no lock message (see `locked-room`), except for each setting that the `access` object of `roomCreate` sets.

#### Scenario: Defaults
- **WHEN** `roomCreate` is called without `access`
- **THEN** `access.anonymous.moderator.enabled`, `access.anonymous.speaker.enabled` and `access.anonymous.recording.enabled` are `true`
- **AND** `access.user.enabled` and `access.lock.enabled` are `false` and `access.lock` has no `message`

#### Scenario: Anonymous moderator link disabled at creation
- **WHEN** `roomCreate` is called with `access.anonymous.moderator.enabled` `false`
- **THEN** the room's anonymous moderator link is disabled and every other setting keeps its default

#### Scenario: Room created locked
- **WHEN** `roomCreate` is called with `access.lock` `{ "enabled": true, "message": "Please wait" }`
- **THEN** the room is locked with that message and every other setting keeps its default

### Requirement: Disabled and unknown links
The server SHALL refuse with `403` an entry through an anonymous link whose access is disabled, whether or not it is to join the meeting, and enabling that access again SHALL make the same URL work again. A secret that matches none of the room's links is refused as specified in `room-members`.

#### Scenario: Disabled speaker link
- **GIVEN** a room whose anonymous speaker access is disabled
- **WHEN** a person tries to enter through its speaker link
- **THEN** the server answers `403`

#### Scenario: Disabled recordings link
- **GIVEN** a room whose anonymous recordings access is disabled
- **WHEN** a person opens its recordings link
- **THEN** the server answers `403` and no recording is shown

#### Scenario: Link enabled again
- **GIVEN** the disabled speaker link of a room is enabled again with `roomUpdateAccess`
- **WHEN** a person enters through the same URL as before
- **THEN** they enter with the room's `speaker` permissions

### Requirement: Access for registered users
A logged-in user SHALL be let into a room, to read it, read its config or enter it, when they are an `admin`, the room's owner or a room member (see `room-members`), or when the room's `access.user.enabled` is `true`, in which case a user who is neither SHALL get the permissions of the room's `speaker` role. Any other user SHALL be refused with `403`.

#### Scenario: User access disabled
- **GIVEN** a room with user access disabled
- **AND** a `room_member` user who is not a member of it
- **WHEN** they call `roomGet` or ask to enter the room
- **THEN** the server answers `403`

#### Scenario: User access enabled
- **GIVEN** a room with user access enabled
- **AND** a `room_manager` user who neither owns it nor is a member of it
- **WHEN** they enter the room
- **THEN** they get the permissions of the room's `speaker` role

#### Scenario: Owner with restricted roles
- **GIVEN** a room whose `moderator` role lacks `recordingControl`
- **WHEN** its owner enters the room
- **THEN** they hold every permission, `recordingControl` included (see `permissions`)

### Requirement: Disclosure of the anonymous links
In every room returned by `roomGet` and `roomList`, the server SHALL include the URL of an anonymous link only when the caller holds `roomShareAccessLinks` in that room and every permission the link grants: the `moderator` role's for the moderator link, the `speaker` role's for the speaker link, and `recordingList`, `recordingPlay` and `recordingDownload` for the recordings link. It SHALL always include `access.user.url`, every `enabled` flag and `access.lock.message`.

#### Scenario: Speaker without the permission
- **GIVEN** a room whose `speaker` role lacks `roomShareAccessLinks`
- **WHEN** a participant who entered through the speaker link calls `roomGet` with their room member token
- **THEN** the room carries no `url` under `access.anonymous` but carries `access.user.url` and `access.lock`

#### Scenario: Moderator allowed to share
- **GIVEN** a room with the default role permissions
- **WHEN** a participant who entered through the moderator link calls `roomGet` with their room member token
- **THEN** the room carries the URLs of its moderator, speaker and recordings links

#### Scenario: Speaker allowed to share
- **GIVEN** a room whose `speaker` role holds `roomShareAccessLinks` and otherwise the default speaker permissions
- **WHEN** a participant who entered through the speaker link calls `roomGet` with their room member token
- **THEN** the room carries the URLs of its speaker and recordings links
- **AND** it carries no `access.anonymous.moderator.url`, because the moderator link grants permissions they lack, `participantKick` among them

#### Scenario: Member allowed to share
- **GIVEN** a room member with base role `moderator` whose custom permissions deny `participantKick` and keep `roomShareAccessLinks`
- **WHEN** they list their rooms with `roomList`
- **THEN** that room carries no `access.anonymous.moderator.url`, because the moderator role grants `participantKick`
- **AND** it carries the URL of every other link whose permissions they all hold

#### Scenario: Owner
- **GIVEN** a room whose `moderator` role lacks `roomShareAccessLinks`
- **WHEN** its owner, an `admin` user or an API key calls `roomGet`
- **THEN** the room carries the URLs of its three anonymous links, because they hold every permission

### Requirement: Room role permissions at creation
The server SHALL build each room role's permission set from the defaults (see `permissions`) overridden key by key by the `roles.moderator.permissions` and `roles.speaker.permissions` that `roomCreate` carries, and SHALL answer `422` to a permission whose value is not a boolean.

#### Scenario: Speaker allowed to record
- **WHEN** `roomCreate` is called with `roles.speaker.permissions` `{ "recordingControl": true }`
- **THEN** the room's `speaker` role holds `recordingControl` and every other default speaker permission
- **AND** the `moderator` role holds its default permissions

#### Scenario: Invalid permission value
- **WHEN** `roomCreate` is called with `roles.moderator.permissions.chatWrite` set to `"yes"`
- **THEN** the server answers `422`

### Requirement: Updating the room roles
`roomUpdateRoles` SHALL be applied only for the callers allowed to manage the room (see `rooms`), SHALL merge the given permissions key by key into the stored role sets and answer `200` with both complete sets, and SHALL answer `409` while the room has an active meeting, `404` for a room that does not exist, and `422` when `roles` is missing or a permission is not a boolean.

#### Scenario: Partial roles update
- **GIVEN** an idle room
- **WHEN** its owner calls `roomUpdateRoles` with `roles.speaker.permissions` `{ "chatWrite": false }`
- **THEN** the server answers `200` with both role sets, the speaker one without `chatWrite` and otherwise unchanged

#### Scenario: Roles update during a meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `roomUpdateRoles`
- **THEN** the server answers `409` and the role sets are unchanged

#### Scenario: Body without roles
- **WHEN** `roomUpdateRoles` is called with an empty body
- **THEN** the server answers `422`

### Requirement: Effects of a roles update
After `roomUpdateRoles`, the room's members SHALL follow the new role sets as `room-members` specifies, and the room member tokens of the room issued before the update SHALL stop being accepted as `authentication` specifies.

#### Scenario: Member follows their base role
- **GIVEN** a room member with base role `speaker` and no custom permissions
- **WHEN** the room's `speaker` role loses `chatWrite`
- **THEN** that member's effective permissions no longer include `chatWrite`

### Requirement: Updating the room access
`roomUpdateAccess` SHALL be applied only for the callers allowed to manage the room (see `rooms`), SHALL merge the given settings into the stored ones and answer `200` with the room's complete `access`, URLs included. It SHALL answer `409` while the room has an active meeting, decided by the write itself so a meeting that starts meanwhile keeps the stored settings, and `404` for a room that does not exist. Room member tokens issued before the update stop being accepted (see `authentication`).

#### Scenario: Enable user access
- **GIVEN** an idle room with user access disabled
- **WHEN** its owner calls `roomUpdateAccess` with `access.user.enabled` `true`
- **THEN** the server answers `200` with `access.user.enabled` `true` and the anonymous flags and the lock unchanged

#### Scenario: Access update during a meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `roomUpdateAccess`
- **THEN** the server answers `409` and the access settings are unchanged

### Requirement: Shape of an access update
`roomUpdateAccess` SHALL answer `422` when `access` is missing, a flag is not a boolean, `access.lock` is sent without its `enabled` switch or `access.lock.message` is longer than 500 characters. `access.lock.message` set to `null` SHALL remove the stored message.

#### Scenario: Lock message without its switch
- **WHEN** `roomUpdateAccess` is called with `access` `{ "lock": { "message": "Please wait" } }`
- **THEN** the server answers `422` naming `lock.enabled`

#### Scenario: Lock message removed
- **GIVEN** a locked room with a lock message
- **WHEN** `roomUpdateAccess` is called with `access.lock` `{ "enabled": true, "message": null }`
- **THEN** the room stays locked and `access.lock` has no message
