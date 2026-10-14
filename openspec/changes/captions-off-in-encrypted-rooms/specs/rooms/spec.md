## MODIFIED Requirements

### Requirement: Wizard dependent settings
The wizard SHALL keep end-to-end encryption mutually exclusive with recording and with live captions, restoring the previous state of each when encryption is turned off again, and SHALL disable the `mediaChangeVirtualBackground` role switches while virtual backgrounds are off, restoring them as left when virtual backgrounds are turned back on. The chat role switches are specified in `meeting-chat`.

#### Scenario: Enabling end-to-end encryption
- **GIVEN** the wizard with recording allowed
- **WHEN** the user turns end-to-end encryption on and later off again
- **THEN** recording is turned off while encryption is on and allowed again afterwards

#### Scenario: Enabling end-to-end encryption with live captions on
- **GIVEN** the wizard with live captions turned on
- **WHEN** the user turns end-to-end encryption on and later off again
- **THEN** live captions are turned off and cannot be turned on while encryption is on, and are on again afterwards

#### Scenario: Virtual backgrounds turned off
- **GIVEN** the wizard with virtual backgrounds turned off in the Meeting step
- **WHEN** the user opens the Room Access step
- **THEN** the `mediaChangeVirtualBackground` switches of both roles are disabled while the chat ones stay enabled
