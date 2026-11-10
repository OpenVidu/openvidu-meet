## MODIFIED Requirements

### Requirement: Disclosure of the anonymous links
In every room returned by `getRoom` and `getRooms`, the server SHALL include the URL of an anonymous link only when the caller holds `roomShareAccessLinks` in that room and every permission the link grants: the `moderator` role's for the moderator link, the `speaker` role's for the speaker link, and `recordingList`, `recordingPlay` and `recordingDownload` for the recordings link. It SHALL always include `access.user.url` and every `enabled` flag.

#### Scenario: Speaker without the permission
- **GIVEN** a room whose `speaker` role lacks `roomShareAccessLinks`
- **WHEN** a participant who entered through the speaker link calls `getRoom` with their room member token
- **THEN** the room carries no `url` under `access.anonymous` but carries `access.user.url`

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

### Requirement: Sharing links from the console
The console SHALL offer sharing a room's links on the Rooms and room detail pages only when the server returned the URL of its anonymous speaker or moderator link, and never for a closed room. It SHALL offer the user access link and each anonymous link whose URL was returned, selectable while enabled. Next to a disabled link, and next to the user access link while user access is disabled, a user who manages the room SHALL get a shortcut to the Room Access step of the wizard.

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

#### Scenario: User given only the speaker link
- **GIVEN** a `room_member` user for whom the server returned the room's speaker link but not its moderator link
- **WHEN** they open the room's share dialog
- **THEN** it offers the user access link and the anonymous speaker link, and no moderator link

### Requirement: Sharing the room from the meeting
In a meeting opened in the standalone app, a participant SHALL be offered the room's anonymous speaker link to copy while the server returns its URL to them and that link is enabled: on the join screen while the room is not closed, in a toolbar button, atop the participants panel and in an overlay shown while they are alone. It SHALL be displayed as the host and path of the user access link. Embedded meetings (webcomponent or iframe) SHALL never offer it.

#### Scenario: Moderator alone in the meeting
- **GIVEN** a participant holding `roomShareAccessLinks` alone in a meeting in the standalone app
- **WHEN** they click copy in the overlay
- **THEN** the room's anonymous speaker URL is copied to the clipboard
- **AND** the overlay disappears once another participant joins

#### Scenario: Participant without the permission
- **GIVEN** a participant without `roomShareAccessLinks`
- **WHEN** they are on the join screen or in the meeting
- **THEN** no share link, copy button or share overlay is shown

#### Scenario: Anonymous speaker link disabled
- **GIVEN** a room whose `access.anonymous.speaker.enabled` is `false`
- **AND** a participant holding `roomShareAccessLinks` in its meeting in the standalone app
- **WHEN** they are on the join screen or in the meeting, alone or not
- **THEN** no share link, copy button or share overlay is shown, and the overlay shown while alone says they are waiting for others instead

#### Scenario: Speaker link beyond the participant's permissions
- **GIVEN** a participant holding `roomShareAccessLinks` but not `chatWrite`, in a room whose `speaker` role grants `chatWrite`
- **WHEN** they are on the join screen or in the meeting, alone or not
- **THEN** no share link, copy button or share overlay is shown, and the overlay shown while alone says they are waiting for others instead

#### Scenario: Permissions changed during the meeting
- **GIVEN** a participant holding `roomShareAccessLinks` but not `chatWrite`, alone in a meeting in the standalone app, in a room whose `speaker` role grants `chatWrite`
- **WHEN** a change of their permissions gives them `chatWrite`, and later takes it away again
- **THEN** the share link, copy button and share overlay appear without reloading the page, and disappear again

#### Scenario: Embedded meeting
- **GIVEN** a participant holding `roomShareAccessLinks` in a meeting embedded with the webcomponent
- **WHEN** they are alone in the meeting
- **THEN** no share link is shown and a notice says they are waiting for others instead
