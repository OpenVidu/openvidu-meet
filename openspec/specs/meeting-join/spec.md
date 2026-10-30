# Meeting Join Specification

## Purpose

Entering and leaving a meeting: how a person reaches a room, gives their name, chooses their devices and
joins, what they see when access fails or the meeting ends, and how a host application embedding Meet
learns about it and gets the participant back. Participants, host applications and the people who share
room links rely on it.

Surfaces: the meeting app at `<base path>/room/{roomId}`, opened in an iframe or in its own browser tab (the standalone
app, reached by a direct link or from the console), the embedded
element `<openvidu-meet>` with the attributes `room-url`, `participant-name`, `participant-external-id`,
`participant-metadata`, `initial-audio-active`, `initial-video-active`, `e2ee-key` and `leave-redirect-url`,
the command `meetingLeave` and the events `meetingJoined`, `meetingLeft` and `embeddedCloseRequested`
(TSDoc in `meet-ce/typings/src/embedded/`), the room config fields `initialAudioActive` and
`initialVideoActive`, and the internal operation `generateRoomMemberToken`
(`meet-ce/backend/openapi/room-members/internal/`). Documented in openvidu.io
`docs/meet/features/meetings/overview.md`, `docs/meet/features/meetings/lifecycle.md`,
`docs/meet/embedded/reference/direct-link.md`, `docs/meet/embedded/reference/iframe.md`,
`docs/meet/embedded/reference/webcomponent.md` and `docs/meet/embedded/tutorials/access/`.

## Requirements

### Requirement: Entry URL and entry parameters
The meeting SHALL be entered at `<base path>/room/{roomId}`, with the room access secret in the `secret` query parameter. A direct link and an iframe `src` use that URL and accept every embedded attribute except `room-url` and `recording-url` as a query parameter of the same name; the embedded element takes the URL in `room-url` and the rest as attributes. Who may enter with which link is defined in `room-access`.

#### Scenario: Direct link with entry parameters
- **GIVEN** an anonymous speaker access link of an open room
- **WHEN** a person opens it with `&participant-name=John` appended
- **THEN** the join screen of that room is shown with the name field holding `John`

#### Scenario: Embedded element entering a room
- **GIVEN** a host page with `<openvidu-meet room-url="<anonymous moderator link>">`
- **WHEN** the element is connected
- **THEN** the join screen of that room is shown inside the element

#### Scenario: Embedded element without a usable room URL
- **GIVEN** an `<openvidu-meet>` element with neither `room-url` nor `recording-url`, or with a `room-url` whose room id cannot be read
- **WHEN** the element is connected
- **THEN** it shows the "Unable to load OpenVidu Meet" error screen and logs the cause to the browser console

### Requirement: Access check before the join screen
Before showing the join screen, the meeting SHALL check access to the room with the link's secret, the signed-in user, or both, without joining the meeting, and SHALL show an access error screen when the check fails: "Invalid link" for an unknown secret, "Anonymous access disabled" when the link's role has anonymous access turned off, "Invalid member" for a removed identified guest, "Invalid room" for a missing room, "Forbidden room access" when refused, "Too many requests" when rate limited.

#### Scenario: Unknown secret
- **GIVEN** a room URL whose `secret` matches none of the room's access secrets
- **WHEN** a person opens it
- **THEN** the "Invalid link" error screen is shown and no join screen

#### Scenario: Anonymous access disabled for the role
- **GIVEN** a room whose anonymous speaker access is disabled
- **WHEN** a person opens its speaker link
- **THEN** the "Anonymous access disabled" error screen is shown

#### Scenario: Removed identified guest
- **GIVEN** the personal link of an identified guest who was removed from the room
- **WHEN** they open it
- **THEN** the "Invalid member" error screen is shown

#### Scenario: Deleted room
- **GIVEN** a link to a room that no longer exists
- **WHEN** a person opens it
- **THEN** the "Invalid room" error screen is shown

#### Scenario: Signed-in user without access
- **GIVEN** a signed-in user who is not a member of a room whose user access is disabled
- **WHEN** they open the room's user access link
- **THEN** the "Forbidden room access" error screen is shown

### Requirement: Links without a secret require signing in
An entry URL without `secret` SHALL require a signed-in Meet user: a person without a valid session SHALL be shown the login screen, inside the iframe or the embedded element when embedded, and SHALL return to the room once signed in. Authentication itself is defined in `authentication`.

#### Scenario: User access link opened without a session
- **GIVEN** a room member user who is not signed in
- **WHEN** they open the room's user access link
- **THEN** the login screen is shown
- **AND** after signing in they reach the join screen of that room with their name filled in and locked

#### Scenario: Login inside the embedded element
- **GIVEN** an `<openvidu-meet>` element whose `room-url` is a user access link, and no session
- **WHEN** the element is connected
- **THEN** the login form is shown inside the element and the host application never handles the password

### Requirement: Secret and encryption key are kept out of the address bar
In the standalone app and the iframe the meeting SHALL remove `secret` and `e2ee-key` from the address bar once the room is entered, and SHALL keep both for the browser tab together with their room, so reloading the same room enters it again with the same access and key. An entry to another room without `secret` or `e2ee-key`, in the same tab or in the same embedded element, SHALL NOT use them.

#### Scenario: Reload after entering
- **GIVEN** a participant who opened `/room/{roomId}?secret=<speaker secret>`
- **WHEN** the room is entered
- **THEN** the address bar shows `/room/{roomId}` without `secret`
- **AND** reloading the page shows the join screen of the same room with the same access

#### Scenario: Another room in the same tab
- **GIVEN** a tab that entered room A through its anonymous speaker link, with no Meet session
- **WHEN** the same tab opens room B's user access link, which carries no `secret`
- **THEN** the login screen is shown, not the "Invalid link" error screen

#### Scenario: Element switched to another room
- **GIVEN** an `<openvidu-meet>` on room A's join screen, entered through room A's anonymous speaker link, with no Meet session
- **WHEN** the host sets `room-url` to room B's user access link, which carries no `secret`
- **THEN** the element shows the login screen, not the "Invalid link" error screen

### Requirement: Join screen
The join screen SHALL show the room name, a name field and a join button that stays disabled while the name is empty, and SHALL NOT accept a name made only of spaces; in a room with end-to-end encryption enabled it SHALL also show that meetings are encrypted and require the encryption key, unless `e2ee-key` provided it. Encryption itself is defined in `meeting-media`.

#### Scenario: Empty name
- **GIVEN** an anonymous participant on the join screen
- **WHEN** the name field is empty
- **THEN** the join button is disabled

#### Scenario: Name made of spaces
- **GIVEN** an anonymous participant who typed only spaces in the name field
- **WHEN** they press the join button
- **THEN** they stay on the join screen

#### Scenario: Encrypted room without a key
- **GIVEN** a room with `config.e2ee.enabled` true
- **WHEN** a participant opens its link without `e2ee-key`
- **THEN** the join screen shows the encryption badge and a required encryption key field

#### Scenario: Encrypted room with the key and the name provided
- **GIVEN** a room with `config.e2ee.enabled` true
- **WHEN** an embedded element enters it with both `participant-name` and `e2ee-key`
- **THEN** no encryption key field is shown, the name field is locked and the join button is enabled

### Requirement: Join screen when joining is not possible
When the room is closed, or the participant does not hold `meetingJoin`, the join screen SHALL replace the name form with a notice saying so: the room is closed, or the participant may enter the room but not join its meetings.

#### Scenario: Closed room
- **GIVEN** a room whose status is `closed`
- **WHEN** a participant opens one of its access links
- **THEN** the join screen says the room is closed and offers no name field or join button

#### Scenario: Participant without meetingJoin
- **GIVEN** an identified guest whose permissions have `meetingJoin` false
- **WHEN** they open their personal link
- **THEN** the join screen says they cannot join meetings in this room and offers no join button

#### Scenario: Anonymous recording link
- **GIVEN** a room with recordings and anonymous recording access enabled
- **WHEN** a person opens the room with its anonymous recording secret
- **THEN** the join screen shows the access-restricted notice and offers to browse the room's recordings (see `recordings`)

### Requirement: Join screen preparation failure
When the room cannot be loaded within 12 seconds, the meeting SHALL show that it could not prepare the meeting instead of the join screen.

#### Scenario: Room data does not arrive
- **GIVEN** a participant whose access check succeeded
- **WHEN** loading the room takes longer than 12 seconds or fails
- **THEN** the screen says the meeting could not be prepared and an error dialog is shown

### Requirement: Participant name precedence
The join screen SHALL fill the name from, in order: the room member record (identified guests and member users), the signed-in user's name, `participant-name`, or the last name typed in this browser. The first three lock the field; the last stays editable. Each entry SHALL take it afresh, so an entry never shows the identity of an earlier entry made through another link.

#### Scenario: Identified guest
- **GIVEN** an identified guest named `Ana`
- **WHEN** an embedded element enters with her personal link and `participant-name="Bob"`
- **THEN** the name field holds `Ana` and is locked

#### Scenario: Signed-in user through an anonymous link
- **GIVEN** a signed-in user named `Carol` who is not a member of the room
- **WHEN** they open the room's anonymous speaker link
- **THEN** the name field holds `Carol` and is locked

#### Scenario: Anonymous participant with participant-name
- **GIVEN** an anonymous moderator link
- **WHEN** it is opened with `participant-name=Dave`
- **THEN** the name field holds `Dave` and is locked

#### Scenario: Anonymous participant returning
- **GIVEN** a browser where an anonymous participant typed `Erin` in an earlier entry
- **WHEN** they open an anonymous link without `participant-name`
- **THEN** the name field holds `Erin` and can be edited

#### Scenario: Element replaced with another link
- **GIVEN** an embedded element that entered through an identified guest's personal link
- **WHEN** the host removes it and adds a new one with an anonymous moderator link, in a browser that never stored a typed name
- **THEN** the name field is empty and editable

### Requirement: Typed names are remembered
A name the participant typed SHALL be remembered in the browser for later entries when they join; a name that came from the member record, the signed-in user or `participant-name` SHALL NOT be remembered.

#### Scenario: Name typed by the participant
- **GIVEN** an anonymous participant who types `Frank` and joins
- **WHEN** they later open an anonymous link of any room in the same browser
- **THEN** the name field holds `Frank`

#### Scenario: Name imposed by the host
- **GIVEN** a browser where no name was ever typed, and an entry with `participant-name=Grace` that joined
- **WHEN** the participant later opens an anonymous link without `participant-name`
- **THEN** the name field is empty

### Requirement: Joining happens from the device setup screen
Submitting the join screen SHALL open the device setup screen, where the participant prepares their camera and microphone (see `meeting-media`), and the participant SHALL join only when they press its join button: until then the meeting is not started (see `meetings`), no name is reserved and the meeting's capacity is not checked.

#### Scenario: Choosing devices
- **GIVEN** an open room without a meeting
- **WHEN** a participant submits the join screen and stays on the device setup screen
- **THEN** the room status stays `open`

#### Scenario: Pressing join
- **GIVEN** a participant on the device setup screen of an open room without a meeting
- **WHEN** they press the join button
- **THEN** they enter the meeting and the room status becomes `active_meeting`

#### Scenario: Double press
- **GIVEN** a participant on the device setup screen
- **WHEN** they press the join button twice quickly
- **THEN** they join once, with a single name and identity

### Requirement: Server checks when joining
When a participant joins, the server SHALL issue their join token only if the room is open (`409` otherwise), they hold `meetingJoin` (`403`), a name is given or known from their member record or user account (`400`), and the meeting is below its `maxParticipants` (`409`, see `meetings`). The meeting SHALL then show the "Closed room", "Forbidden room access" or "Meeting full" error screen.

#### Scenario: Room closed while choosing devices
- **GIVEN** a participant on the device setup screen
- **WHEN** a room manager closes the room and the participant presses join
- **THEN** the server answers `409` and the "Closed room" error screen is shown

#### Scenario: Full meeting
- **GIVEN** a room with `config.maxParticipants` 2 and a meeting with 2 participants
- **WHEN** a third participant presses join
- **THEN** the server answers `409` and the "Meeting full" error screen is shown

#### Scenario: Recording secret cannot join
- **GIVEN** the anonymous recording secret of a room
- **WHEN** a join token is requested with it, `joinMeeting` true and a participant name
- **THEN** the server answers `403`

#### Scenario: No name for an anonymous join
- **GIVEN** an anonymous moderator secret
- **WHEN** a join token is requested with `joinMeeting` true and no `participantName`
- **THEN** the server answers `400`

### Requirement: Initial media state precedence
For each device, the meeting SHALL resolve the initial state once per entry: off when the participant lacks the publish permission (`mediaPublishAudio`, `mediaPublishVideo`); otherwise `initial-audio-active` or `initial-video-active` when set, to either value; otherwise the room's `config.initialAudioActive` or `config.initialVideoActive`, which default to `true`. The two devices are resolved independently.

#### Scenario: Room default applies
- **GIVEN** a room with `config.initialAudioActive` and `config.initialVideoActive` false
- **WHEN** a participant reaches the device setup screen without either attribute
- **THEN** the microphone and the camera start off

#### Scenario: Attribute raises the room default
- **GIVEN** the same room
- **WHEN** an embedded element enters with `initial-audio-active="true"` and `initial-video-active="true"`
- **THEN** both devices start on in the device setup screen and stay on after joining

#### Scenario: Devices resolved independently
- **GIVEN** the same room
- **WHEN** an entry sets `initial-audio-active="true"` only
- **THEN** the microphone starts on and the camera starts off

#### Scenario: Permission wins
- **GIVEN** a participant without `mediaPublishVideo`
- **WHEN** they enter with `initial-video-active="true"`
- **THEN** the camera does not start

### Requirement: Initial media attribute values
`initial-audio-active` and `initial-video-active` SHALL follow the boolean rule of `embedded-api`, as attributes and as query parameters of the direct link and the iframe alike: `false` starts the device off and any other present value on, while an absent one leaves the decision to the room.

#### Scenario: Query parameter turns the microphone off
- **GIVEN** a room with the default initial media config
- **WHEN** an iframe opens its link with `initial-audio-active=false`
- **THEN** the microphone starts off and the camera starts on

#### Scenario: Iframe without the parameter
- **GIVEN** a room with `config.initialVideoActive` false
- **WHEN** an iframe opens its link without `initial-video-active`
- **THEN** the camera starts off

### Requirement: Initial media state is a starting point
The initial state SHALL only seed the device setup screen: the participant can change it before and after joining, the meeting starts with what the device setup screen shows, and neither the initial state nor the participant's on and off choices SHALL be remembered for a later entry.

#### Scenario: Choice not carried to the next meeting
- **GIVEN** a participant who turned the camera off on the device setup screen, joined and left
- **WHEN** they enter a meeting again in the same tab without `initial-video-active`
- **THEN** the camera starts as the room's default says

#### Scenario: Explicit request after an earlier choice
- **GIVEN** a participant who turned the camera off in an earlier meeting of the same embedded element
- **WHEN** the host enters again with `initial-video-active="true"`
- **THEN** the camera starts on

#### Scenario: Attribute not remembered
- **GIVEN** an entry with `initial-audio-active="false"` that joined and left
- **WHEN** the participant enters again without the attribute in a room with the default config
- **THEN** the microphone starts on

### Requirement: Room defaults reach the device setup screen
The meeting SHALL load the room's initial media defaults before opening the devices, so a slow answer still applies them; when they cannot be loaded, the join SHALL proceed as if the room set no default.

#### Scenario: Slow room configuration
- **GIVEN** a room with both initial media defaults false
- **WHEN** the room configuration takes five seconds to arrive
- **THEN** the device setup screen still opens with the microphone and the camera off

### Requirement: Participant correlation fields
`participant-external-id` and `participant-metadata` SHALL be attached to the participant unchanged and never interpreted by Meet; they travel as `externalId` and `metadata` in participant payloads (see `meetings`) and are taken from each entry's own attributes or query parameters, never from an earlier entry.

#### Scenario: Fields reach the integration
- **GIVEN** an embedded element with `participant-external-id="user_42"` and `participant-metadata='{"plan":"pro"}'`
- **WHEN** the participant joins
- **THEN** the `participantJoined` webhook carries `externalId` `user_42` and that `metadata`

#### Scenario: Fields not carried over
- **GIVEN** a participant who joined with `participant-external-id` set and left
- **WHEN** the host enters again without it
- **THEN** the new participant carries no `externalId`

### Requirement: Correlation field limits
The server SHALL reject a join whose `participant-external-id` is empty, longer than 64 characters or has characters other than letters, digits, `_` and `-`, or whose `participant-metadata` exceeds 2048 UTF-8 bytes, with `422`, and the participant SHALL NOT enter the meeting. The meeting SHALL then show the "Invalid participant data" error screen and log the server's reason in the browser console.

#### Scenario: External id with a space
- **GIVEN** an embedded element with `participant-external-id="user 42"`
- **WHEN** the participant presses join
- **THEN** the server answers `422` and the participant does not enter the meeting
- **AND** the "Invalid participant data" error screen is shown and the browser console names `participantExternalId`

#### Scenario: Metadata over the byte limit
- **GIVEN** a `participant-metadata` of 2000 characters that takes more than 2048 bytes in UTF-8
- **WHEN** a join token is requested with it
- **THEN** the server answers `422`

### Requirement: meetingJoined event
In the iframe and the embedded element, the meeting SHALL emit `meetingJoined` with the room id and the local participant's identity exactly once each time the local participant connects to a meeting, and the deprecated `joined` alongside it until 3.12.0 (see `embedded-api`). A direct link emits no events.

#### Scenario: Joining emits one event
- **GIVEN** an embedded element on the device setup screen
- **WHEN** the participant presses join
- **THEN** the host receives one `meetingJoined` carrying `roomId` and `participantIdentity`, and one `joined` with the same payload

#### Scenario: Joining again
- **GIVEN** a participant who joined, left and entered again with the same element
- **WHEN** they join the second time
- **THEN** the host receives a second `meetingJoined`

### Requirement: meetingLeft event
In the iframe and the embedded element, the meeting SHALL emit `meetingLeft` exactly once when the local participant leaves a meeting they joined, with the room id, their identity and a `reason`, and the deprecated `left` alongside it until 3.12.0. The one exception is the host removing the element or the iframe: that leave is the host's own decision and emits nothing (see `embedded-distribution`).

#### Scenario: Host removes the element
- **GIVEN** a participant in a meeting inside an embedded element
- **WHEN** the host removes the element from the document for good
- **THEN** the host receives no `meetingLeft`

#### Scenario: Leave command
- **GIVEN** a participant in a meeting inside an embedded element
- **WHEN** the host calls `meetingLeave()`
- **THEN** the host receives one `meetingLeft` with `reason` `voluntary_leave`

#### Scenario: Repeated leave clicks
- **GIVEN** a participant in a meeting inside an iframe
- **WHEN** they press leave several times quickly
- **THEN** the host receives a single `meetingLeft`

#### Scenario: Leaving right after joining
- **GIVEN** a participant who has just received `meetingJoined`
- **WHEN** they leave immediately
- **THEN** the host still receives `meetingLeft`

### Requirement: Leave reasons
The `reason` of `meetingLeft` SHALL be one of the leave reasons of `meetings`, `voluntary_leave` also when the participant closes the page, except that an end of the meeting for everyone SHALL be `meeting_ended_by_self` when the local participant ended it, `meeting_ended_by_duration_limit` when it reached `maxDurationMinutes`, and `meeting_ended` whoever or whatever else ended it (another participant, the REST API, the room's deletion).

#### Scenario: Ended by a moderator
- **GIVEN** two participants in a meeting, each in an embedded element
- **WHEN** one of them ends the meeting for everyone from the leave menu
- **THEN** the other receives `meetingLeft` with `reason` `meeting_ended`
- **AND** the one who ended it receives `meeting_ended_by_self`

#### Scenario: Ended with the meetingEnd command
- **GIVEN** two participants in a meeting, each in an embedded element, the first holding `meetingEnd`
- **WHEN** the first element's host calls `meetingEnd()`, or the deprecated `endMeeting()`
- **THEN** the first element emits `meetingLeft` with `reason` `meeting_ended_by_self`
- **AND** the second receives `meeting_ended`

#### Scenario: Kicked
- **GIVEN** a participant in a meeting
- **WHEN** a moderator removes them
- **THEN** they receive `meetingLeft` with `reason` `participant_kicked`

#### Scenario: Duration limit
- **GIVEN** a meeting whose room has `config.maxDurationMinutes` set
- **WHEN** the meeting reaches it
- **THEN** each participant receives `meetingLeft` with `reason` `meeting_ended_by_duration_limit`

#### Scenario: Same identity elsewhere
- **GIVEN** an identified guest in a meeting inside an embedded element
- **WHEN** they join the same meeting from another tab
- **THEN** the element emits `meetingLeft` with `reason` `duplicate_identity`

### Requirement: Leaving the meeting
Every participant SHALL be able to leave the meeting from the toolbar; a participant holding `meetingEnd` SHALL get a choice between leaving and ending the meeting for everyone (ending is defined in `meetings`). The embedded command `meetingLeave`, and its deprecated alias `leaveRoom` until 3.12.0, SHALL leave like the toolbar, need no permission, and do nothing before the participant has joined.

#### Scenario: Participant without meetingEnd
- **GIVEN** a speaker without `meetingEnd` in a meeting
- **WHEN** they press the leave button
- **THEN** they leave the meeting at once and the end screen is shown

#### Scenario: Participant with meetingEnd
- **GIVEN** a moderator holding `meetingEnd`
- **WHEN** they press the leave button
- **THEN** a menu offers to leave or to end the meeting for everyone

#### Scenario: Leave command before joining
- **GIVEN** an embedded element on the device setup screen
- **WHEN** the host calls `meetingLeave()`
- **THEN** nothing happens and the device setup screen stays

### Requirement: End screen
After the local participant leaves a meeting, the meeting SHALL show the end screen, whose title and message state the reason: they left, were removed by a moderator, a moderator ended the meeting, they ended it, it reached its duration limit, the network or the server dropped them, they joined from another tab or device, or an unexpected error.

#### Scenario: Removed by a moderator
- **GIVEN** a participant in a meeting
- **WHEN** a moderator removes them
- **THEN** the end screen says they were removed by a moderator

#### Scenario: Duration limit reached
- **GIVEN** a meeting that reaches its room's `maxDurationMinutes`
- **WHEN** it ends
- **THEN** the end screen says it ended because it reached its maximum duration

#### Scenario: Joined from another tab
- **GIVEN** a signed-in member in a meeting in one tab
- **WHEN** they join the same meeting from another tab
- **THEN** the first tab shows the end screen saying the meeting was closed because they joined from another tab or device

### Requirement: Dismissing the end and error screens
The end screen and the access error screens SHALL offer a dismiss button where it leads somewhere: always in the embedded element and the iframe; when a leave redirect is set, in every mode; and in the standalone app for a signed-in user, leading to the console (`Back to Rooms` on the end screen, `Back to Console` on an error screen). Otherwise no button is shown.

#### Scenario: Anonymous participant in the standalone app
- **GIVEN** an anonymous participant who opened a direct link without `leave-redirect-url`
- **WHEN** they leave the meeting
- **THEN** the end screen shows no dismiss button

#### Scenario: Signed-in user in the standalone app
- **GIVEN** a signed-in user in a meeting opened from the console
- **WHEN** they leave and press `Back to Rooms`
- **THEN** the console rooms page is shown

#### Scenario: Error screen in the iframe
- **GIVEN** an iframe without `leave-redirect-url` showing an access error screen
- **WHEN** the participant presses its dismiss button
- **THEN** the containing page receives `embeddedCloseRequested` and the iframe stays where it is

### Requirement: Back button on the join screen
The join screen SHALL offer a back button: always in the embedded element and the iframe, and in the standalone app when a leave redirect is set or the participant is signed in. In the standalone app a signed-in participant without a leave redirect goes back to the console rooms page. In the embedded element and the iframe the button reads `Back` and emits `embeddedCloseRequested`, then follows the leave redirect when one is set.

#### Scenario: Anonymous direct link
- **GIVEN** an anonymous participant opening a direct link without `leave-redirect-url`
- **WHEN** the join screen is shown
- **THEN** it has no back button

#### Scenario: Embedded element without a redirect
- **GIVEN** an embedded element without `leave-redirect-url`
- **WHEN** the participant presses back on the join screen
- **THEN** the host receives `embeddedCloseRequested` and the element stays where it is

#### Scenario: Signed-in user in an iframe without a redirect
- **GIVEN** a signed-in user on the join screen of an iframe without `leave-redirect-url`
- **WHEN** the join screen is shown
- **THEN** its back button reads `Back`, not `Back to Rooms`
- **AND** pressing it posts `embeddedCloseRequested` to the containing page and the iframe stays where it is

#### Scenario: Anonymous participant in an iframe
- **GIVEN** an anonymous participant on the join screen of an iframe without `leave-redirect-url`
- **WHEN** the join screen is shown
- **THEN** it offers a back button reading `Back`

### Requirement: embeddedCloseRequested event
In the iframe and the embedded element, dismissing the join, end or error screen, or closing a recording screen (see `recordings`), SHALL emit `embeddedCloseRequested`, with no payload, before any leave redirect, and the deprecated `closed` alongside it until 3.12.0. Leaving the meeting alone SHALL NOT emit it: the meeting may continue for the others and the host decides what to remove.

#### Scenario: Leave then dismiss
- **GIVEN** a moderator in a meeting inside an embedded element
- **WHEN** they leave the meeting
- **THEN** the host receives `meetingLeft` and no `embeddedCloseRequested`
- **AND** pressing the end screen's button emits `embeddedCloseRequested` and `closed`

#### Scenario: Ended meeting
- **GIVEN** an iframe whose participant ended the meeting
- **WHEN** they press the end screen's button
- **THEN** the host receives `embeddedCloseRequested`

### Requirement: Leave redirect
When a leave redirect is set, dismissing the join, end or error screen, or closing a recording screen, SHALL navigate to it; in the iframe it SHALL navigate the host page, or the iframe itself when the iframe's sandbox forbids it. Only `http` and `https` destinations SHALL be followed. Leaving the meeting alone does not redirect: the end screen is shown first.

#### Scenario: Join screen back button
- **GIVEN** an embedded element with `leave-redirect-url="https://app.example.com/done"`
- **WHEN** the participant presses back on the join screen
- **THEN** the host receives `embeddedCloseRequested` and the page navigates to `https://app.example.com/done`

#### Scenario: End screen in an iframe
- **GIVEN** an iframe whose `src` carries `leave-redirect-url=https://app.example.com/done`
- **WHEN** the participant leaves and presses the end screen's button
- **THEN** the host page, not only the iframe, navigates to `https://app.example.com/done`

#### Scenario: Non-web destination
- **GIVEN** a `leave-redirect-url` with the `javascript:` scheme
- **WHEN** the participant dismisses the end screen
- **THEN** no navigation happens

### Requirement: Leave redirect resolution
An absolute `leave-redirect-url` SHALL be used as given. A path starting with `/` SHALL resolve against the host page's origin in the embedded element and in the iframe (the page that loaded it), and SHALL be ignored in the standalone app. Without `leave-redirect-url`, a standalone app opened from a page of another origin SHALL return to that page. The leave redirect SHALL be kept for the browser tab across reloads.

#### Scenario: Relative path in the embedded element
- **GIVEN** a host page at `https://app.example.com` with `leave-redirect-url="/meetings/done"`
- **WHEN** the participant dismisses the end screen
- **THEN** the page navigates to `https://app.example.com/meetings/done`

#### Scenario: Direct link followed from another site
- **GIVEN** a page on `https://portal.example.com` linking to a room without `leave-redirect-url`
- **WHEN** a participant follows the link, leaves the meeting and dismisses the end screen
- **THEN** they return to the portal page they came from

### Requirement: Access lost during the meeting
A participant whose access to the room is withdrawn while they are in the meeting, so that the server refuses to renew their room member token, SHALL be taken out to the "Room access revoked" error screen. A renewal that fails because the server is unreachable or failing SHALL leave them in the meeting. Which changes withdraw access is defined in `room-members` and `users`.

#### Scenario: Admin demoted during the meeting
- **GIVEN** an admin in a meeting of a room they neither own nor belong to
- **WHEN** their user role is changed to `room_manager`
- **THEN** they are taken to the "Room access revoked" error screen

#### Scenario: Server briefly unavailable
- **GIVEN** a participant in a meeting
- **WHEN** their token renewal fails because the server cannot be reached for a moment
- **THEN** they stay in the meeting with their current token

### Requirement: Connection failure after the join token
When the meeting cannot connect after the join token was issued, it SHALL tell the participant in a dialog that it could not connect to the meeting, without technical details.

#### Scenario: Media server unreachable
- **GIVEN** a participant whose join token was issued
- **WHEN** the connection to the media server fails
- **THEN** a dialog says the meeting could not be connected and suggests checking the connection
