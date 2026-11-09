## ADDED Requirements

### Requirement: Device controls of the device setup screen
On the device setup screen, the camera and the microphone SHALL each have a control made of two buttons inside one rounded frame: a button that turns the device on or off, borderless, and a menu button beside it that opens the list of devices. The frame and the buttons SHALL keep the rounded corners of the current device buttons. The background effects button SHALL stay a single button, without a frame. The controls SHALL follow the light and dark themes.

#### Scenario: Turning the camera off
- **GIVEN** a participant on the device setup screen with the camera on
- **WHEN** they press the camera toggle
- **THEN** the camera turns off and the device list stays closed

#### Scenario: Choosing a microphone
- **GIVEN** a participant on the device setup screen
- **WHEN** they press the menu button beside the microphone
- **THEN** the list of microphones opens and the microphone stays as it was

#### Scenario: The menu button stays while the device is off
- **GIVEN** a participant on the device setup screen
- **WHEN** they turn the camera or the microphone off
- **THEN** the menu button beside it stays in place and the control keeps its size

#### Scenario: Choosing a microphone while it is off
- **GIVEN** a participant on the device setup screen with the microphone off
- **WHEN** they pick another microphone from the menu and then turn the microphone on
- **THEN** the microphone turns on with the picked one

### Requirement: Microphone level on the device setup screen
On the device setup screen, while the microphone is on, the microphone toggle SHALL show the live level of the selected microphone by filling its background from the bottom, rising and falling with the sound, sensitively enough for the ambient noise of a quiet room to move it. The menu button SHALL never fill. A microphone that is off or muted by the system SHALL show no level; one muted by the system SHALL keep the warning mark and warning on the toggle.

#### Scenario: Speaking into the microphone
- **GIVEN** a participant on the device setup screen with the microphone on
- **WHEN** they speak
- **THEN** the microphone toggle fills and empties with their voice, and the menu button does not change

#### Scenario: Microphone off
- **GIVEN** a participant on the device setup screen with the microphone off
- **WHEN** they speak
- **THEN** the microphone button shows no level

#### Scenario: Muted by the system
- **GIVEN** a participant on the device setup screen whose operating system mutes the microphone input
- **WHEN** the screen shows the microphone control
- **THEN** the microphone toggle shows no level and carries a warning mark, and the system muted warning points at it

#### Scenario: Changing microphone
- **GIVEN** a participant on the device setup screen with the microphone on
- **WHEN** they pick another microphone from the menu
- **THEN** the level follows the newly selected microphone
