## MODIFIED Requirements

### Requirement: Wizard dependent settings
The wizard SHALL keep end-to-end encryption mutually exclusive with recording, live broadcast and live captions, restoring the others when one is turned off again, warning while encryption is on that recording and live captions are unavailable, and SHALL disable the `mediaChangeVirtualBackground` role switches while virtual backgrounds are off, restoring them as left once they are back on, and a role's `mediaChangeVirtualBackground` switch, shown next to its `mediaPublishVideo` one, while that role does not hold `mediaPublishVideo`. The chat and broadcast role switches are specified in `meeting-chat` and `live-broadcast`.

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

#### Scenario: Camera revoked from a role
- **GIVEN** the wizard with virtual backgrounds on and the speaker role holding `mediaPublishVideo` and `mediaChangeVirtualBackground`
- **WHEN** the user switches off the speaker's `mediaPublishVideo`
- **THEN** the speaker's `mediaChangeVirtualBackground` switch is disabled and still on
- **AND** switching `mediaPublishVideo` back on makes it available again
