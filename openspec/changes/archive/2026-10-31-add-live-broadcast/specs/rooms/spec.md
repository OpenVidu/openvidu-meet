## MODIFIED Requirements

### Requirement: Console room wizard
The console SHALL let `admin` and `room_manager` users create a room either by name only or through a wizard with the steps Room Details, Meeting, Recording, Live broadcast and Room Access, and SHALL take the user into the new room's join screen once it is created. A failed creation SHALL keep the wizard and its input and show the server's message. Every wizard session SHALL start from the defaults, never from an abandoned one.

#### Scenario: Basic creation
- **GIVEN** a `room_manager` user on the Rooms page
- **WHEN** they create a room giving only its name
- **THEN** the room is created with the default settings and the browser opens the room's join screen

#### Scenario: Failed creation keeps the input
- **GIVEN** a user filling the advanced wizard
- **WHEN** the server rejects the creation
- **THEN** the wizard stays open with every value as entered and shows the server's message

#### Scenario: Members added in the wizard
- **GIVEN** a user who added room members in the Room Access step
- **WHEN** the room is created and one member cannot be added
- **THEN** the room is created and a warning names the members that failed (see `room-members`)

### Requirement: Wizard validation
The wizard SHALL block finishing while the participant limit is outside 1 to 30, the duration limit outside 1 to 1440 minutes, the auto-deletion date less than an hour ahead, the recording auto-start unreachable with the participant limit, flagging the Meeting and Recording steps in that case, or live broadcast allowed without a destination (see `live-broadcast`), so that it never submits a combination the server rejects (see `room-config`).

#### Scenario: Unreachable auto-start
- **GIVEN** the wizard with participant limit 1
- **WHEN** the user picks the trigger "when the second participant joins"
- **THEN** the finish button is disabled and the Meeting and Recording steps show a warning

#### Scenario: Participant limit out of range
- **WHEN** the user types 31 as participant limit
- **THEN** the field shows an error with the accepted range and the finish button is disabled

#### Scenario: Live broadcast without a destination
- **WHEN** the user allows live broadcast and saves no destination
- **THEN** the finish button is disabled

### Requirement: Wizard dependent settings
The wizard SHALL keep end-to-end encryption mutually exclusive with recording, with live broadcast and with live captions, restoring the previous state of the others when one is turned off again and warning while encryption is on that recording and live captions are unavailable, and SHALL disable the `mediaChangeVirtualBackground` role switches while virtual backgrounds are off, restoring them as left when virtual backgrounds are turned back on. The chat role switches are specified in `meeting-chat`, the broadcast ones in `live-broadcast`.

#### Scenario: Enabling end-to-end encryption
- **GIVEN** the wizard with recording and live broadcast allowed
- **WHEN** the user turns end-to-end encryption on and later off again
- **THEN** recording and live broadcast are turned off while encryption is on and allowed again afterwards

#### Scenario: Enabling end-to-end encryption with live captions on
- **GIVEN** the wizard with live captions turned on
- **WHEN** the user turns end-to-end encryption on and later off again
- **THEN** live captions are turned off and cannot be turned on while encryption is on, a warning says they are unavailable while encryption is enabled, and they are on again afterwards

#### Scenario: Allowing live broadcast in an encrypted room
- **GIVEN** the wizard with end-to-end encryption on
- **WHEN** the user allows live broadcast and later turns it off again
- **THEN** encryption is turned off while live broadcast is allowed and back on afterwards

#### Scenario: Virtual backgrounds turned off
- **GIVEN** the wizard with virtual backgrounds turned off in the Meeting step
- **WHEN** the user opens the Room Access step
- **THEN** the `mediaChangeVirtualBackground` switches of both roles are disabled while the chat ones stay enabled
