# Room Access Specification

## Purpose

Room access decides who may enter a room and with which room role: the anonymous access links of the `moderator` and `speaker` roles and of the room's recordings, access for registered users, and the permission sets of the two room roles. Integrators manage it through the REST API, room managers through the console, and participants share it from the meeting.

Surfaces: REST API (`access` and `roles` of `createRoom`, `updateRoomAccess`, `updateRoomRoles`, the `access` field and the extra field `roles` of room responses; `meet-ce/backend/openapi/rooms/`), console (share dialog of the rooms pages; the wizard steps that edit access and roles are specified in `rooms`), meeting UI (share link on the join screen and in the meeting). Room members, their access links and room member tokens are specified in `room-members`; the permission catalogue, the default permissions of each room role and the admin and owner bypass in `permissions`; how a participant enters a meeting through a link in `meeting-join`; how access URLs are made absolute in `deployment`. Documented in openvidu.io `docs/meet/features/rooms/access.md`.

## Requirements

### Requirement: Access links of a room
The server SHALL give every room, when it is created, four access URLs that stay the same for the room's whole life: an anonymous link for the `moderator` role, one for the `speaker` role and one for the room's recordings page, each carrying its own random `secret`, and the user access link `/room/{roomId}`, which carries no secret.

#### Scenario: Links of a new room
- **WHEN** a room is created
- **THEN** `access.anonymous.moderator.url` and `access.anonymous.speaker.url` point to the room with two different `secret` values
- **AND** `access.anonymous.recording.url` points to the room's recordings page with a third `secret`
- **AND** `access.user.url` points to the room without any `secret`

#### Scenario: Links survive access changes
- **GIVEN** a room whose anonymous speaker link is disabled and later enabled again with `updateRoomAccess`
- **WHEN** the room is read
- **THEN** every access URL is the same as when the room was created

### Requirement: Default access settings
The server SHALL create a room with the anonymous `moderator`, `speaker` and `recording` links enabled and user access disabled, except for each flag that the `access` object of `createRoom` sets.

#### Scenario: Defaults
- **WHEN** `createRoom` is called without `access`
- **THEN** `access.anonymous.moderator.enabled`, `access.anonymous.speaker.enabled` and `access.anonymous.recording.enabled` are `true`
- **AND** `access.user.enabled` is `false`

#### Scenario: Anonymous moderator link disabled at creation
- **WHEN** `createRoom` is called with `access.anonymous.moderator.enabled` `false`
- **THEN** the room's anonymous moderator link is disabled and every other flag keeps its default

### Requirement: Anonymous role links
A person entering a room through the anonymous `moderator` or `speaker` link SHALL need no account and SHALL get exactly the permissions the room currently defines for that role in `roles` (see `permissions` for the defaults), never more.

#### Scenario: Speaker link
- **GIVEN** a room whose `speaker` role has `chatWrite` set to `false`
- **WHEN** a person enters it through the anonymous speaker link
- **THEN** their permissions are those of the room's `speaker` role, without `chatWrite`

#### Scenario: Moderator link
- **WHEN** a person enters a room through its anonymous moderator link
- **THEN** their permissions are those of the room's `moderator` role

### Requirement: Anonymous recordings link
A person entering a room through its anonymous recordings link SHALL get only `recordingList`, `recordingPlay` and `recordingDownload`, whatever the room roles say, so the link never lets anyone join the meeting (see `room-members` for join tokens and `recordings` for what these permissions open).

#### Scenario: Browsing the recordings
- **GIVEN** a room with recordings and its anonymous recordings link enabled
- **WHEN** a person opens that link
- **THEN** they can list, play and download the room's recordings
- **AND** they hold no other permission in the room, `meetingJoin` included

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
- **GIVEN** the disabled speaker link of a room is enabled again with `updateRoomAccess`
- **WHEN** a person enters through the same URL as before
- **THEN** they enter with the room's `speaker` permissions

### Requirement: Access for registered users
A logged-in user SHALL be let into a room, to read it, read its config or enter it, when they are an `admin`, the room's owner or a room member (see `room-members`), or when the room's `access.user.enabled` is `true`, in which case a user who is neither SHALL get the permissions of the room's `speaker` role. Any other user SHALL be refused with `403`.

#### Scenario: User access disabled
- **GIVEN** a room with user access disabled
- **AND** a `room_member` user who is not a member of it
- **WHEN** they call `getRoom` or ask to enter the room
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
In every room returned by `getRoom` and `getRooms`, the server SHALL include the URLs of the anonymous links only when the caller holds `roomShareAccessLinks` in that room, and SHALL always include `access.user.url` and every `enabled` flag. An API key, an `admin` user and the room's owner SHALL always receive them.

#### Scenario: Speaker without the permission
- **GIVEN** a room whose `speaker` role lacks `roomShareAccessLinks`
- **WHEN** a participant who entered through the speaker link calls `getRoom` with their room member token
- **THEN** the room carries no `url` under `access.anonymous` but carries `access.user.url`

#### Scenario: Member allowed to share
- **GIVEN** a room member whose permissions include `roomShareAccessLinks`
- **WHEN** they list their rooms with `getRooms`
- **THEN** that room carries the URLs of its anonymous links

### Requirement: Room role permissions at creation
The server SHALL build each room role's permission set from the defaults (see `permissions`) overridden key by key by the `roles.moderator.permissions` and `roles.speaker.permissions` that `createRoom` carries, and SHALL answer `422` to a permission whose value is not a boolean.

#### Scenario: Speaker allowed to record
- **WHEN** `createRoom` is called with `roles.speaker.permissions` `{ "recordingControl": true }`
- **THEN** the room's `speaker` role holds `recordingControl` and every other default speaker permission
- **AND** the `moderator` role holds its default permissions

#### Scenario: Invalid permission value
- **WHEN** `createRoom` is called with `roles.moderator.permissions.chatWrite` set to `"yes"`
- **THEN** the server answers `422`

### Requirement: Updating the room roles
`updateRoomRoles` SHALL be applied only for the callers allowed to manage the room (see `rooms`), SHALL merge the given permissions key by key into the stored role sets and answer `200` with both complete sets, and SHALL answer `409` while the room has an active meeting, `404` for a room that does not exist, and `422` when `roles` is missing or a permission is not a boolean.

#### Scenario: Partial roles update
- **GIVEN** an idle room
- **WHEN** its owner calls `updateRoomRoles` with `roles.speaker.permissions` `{ "chatWrite": false }`
- **THEN** the server answers `200` with both role sets, the speaker one without `chatWrite` and otherwise unchanged

#### Scenario: Roles update during a meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `updateRoomRoles`
- **THEN** the server answers `409` and the role sets are unchanged

#### Scenario: Body without roles
- **WHEN** `updateRoomRoles` is called with an empty body
- **THEN** the server answers `422`

### Requirement: Effects of a roles update
After `updateRoomRoles`, the room's members SHALL follow the new role sets as `room-members` specifies, and the room member tokens of the room issued before the update SHALL stop being accepted as `authentication` specifies.

#### Scenario: Member follows their base role
- **GIVEN** a room member with base role `speaker` and no custom permissions
- **WHEN** the room's `speaker` role loses `chatWrite`
- **THEN** that member's effective permissions no longer include `chatWrite`

### Requirement: Updating the room access
`updateRoomAccess` SHALL be applied only for the callers allowed to manage the room (see `rooms`), SHALL merge the given `enabled` flags into the stored access settings and answer `200` with the room's complete `access`, URLs included, and SHALL answer `409` while the room has an active meeting, `404` for a room that does not exist and `422` when `access` is missing or a flag is not a boolean. Room member tokens issued before the update stop being accepted (see `authentication`).

#### Scenario: Enable user access
- **GIVEN** an idle room with user access disabled
- **WHEN** its owner calls `updateRoomAccess` with `access.user.enabled` `true`
- **THEN** the server answers `200` with `access.user.enabled` `true` and the anonymous flags unchanged

#### Scenario: Access update during a meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `updateRoomAccess`
- **THEN** the server answers `409` and the access settings are unchanged

### Requirement: Sharing links from the console
The console SHALL let a user share a room's links from the Rooms and room detail pages only when the server returned the room's anonymous links, offering the user access link and the anonymous speaker and moderator links, the anonymous ones only while enabled. Sharing SHALL be unavailable for closed rooms. Next to a disabled link, and next to the user access link while user access is disabled, a user who manages the room SHALL get a shortcut to the Room Access step of the wizard.

#### Scenario: Copying the speaker link
- **GIVEN** a room manager on the Rooms page with an open room they own
- **WHEN** they open the share dialog, choose the anonymous speaker link and copy it
- **THEN** the room's `access.anonymous.speaker.url` is copied to the clipboard

#### Scenario: Disabled anonymous link
- **GIVEN** a room whose anonymous moderator access is disabled
- **WHEN** its owner opens its share dialog
- **THEN** the anonymous moderator link cannot be chosen while the user access link can
- **AND** a shortcut next to the moderator link opens the Room Access step of the wizard

#### Scenario: User without the links
- **GIVEN** a `room_member` user listing a room whose anonymous links the server left out for them
- **WHEN** they look at the room's actions
- **THEN** no share action is offered

### Requirement: Sharing the room from the meeting
In a meeting opened in the standalone app, a participant holding `roomShareAccessLinks` SHALL be offered the room's anonymous speaker link to copy: on the join screen while the room is not closed, in a toolbar button, at the top of the participants panel and in an overlay shown while they are alone. The link SHALL be displayed as the host and path of the user access link. Embedded meetings (webcomponent or iframe) SHALL never offer it.

#### Scenario: Moderator alone in the meeting
- **GIVEN** a participant holding `roomShareAccessLinks` alone in a meeting in the standalone app
- **WHEN** they click copy in the overlay
- **THEN** the room's anonymous speaker URL is copied to the clipboard
- **AND** the overlay disappears once another participant joins

#### Scenario: Participant without the permission
- **GIVEN** a participant without `roomShareAccessLinks`
- **WHEN** they are on the join screen or in the meeting
- **THEN** no share link, copy button or share overlay is shown

#### Scenario: Embedded meeting
- **GIVEN** a participant holding `roomShareAccessLinks` in a meeting embedded with the webcomponent
- **WHEN** they are alone in the meeting
- **THEN** no share link is shown and a notice says they are waiting for others instead
