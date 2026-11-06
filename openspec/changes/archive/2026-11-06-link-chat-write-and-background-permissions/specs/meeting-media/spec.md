## MODIFIED Requirements

### Requirement: Where background effects are offered
The meeting SHALL offer background effects only in a room whose `virtualBackground.enabled` is `true`, its default, and only to participants with both `mediaChangeVirtualBackground` and `mediaPublishVideo`. Where they are not offered, no remembered effect SHALL be applied, and losing either permission during the meeting SHALL remove an applied effect, closing the background effects panel.

#### Scenario: Room with virtual backgrounds off
- **GIVEN** a room with `virtualBackground.enabled` set to `false` and a browser that remembers a background effect
- **WHEN** a participant joins its meeting
- **THEN** the meeting offers no background effects
- **AND** the remembered effect is not applied

#### Scenario: Permission revoked mid-meeting
- **GIVEN** a participant with a background effect applied
- **WHEN** `mediaChangeVirtualBackground` is revoked from them during the meeting
- **THEN** the effect is removed from their video
- **AND** the background effects control disappears

#### Scenario: Participant without mediaPublishVideo
- **GIVEN** a room with virtual backgrounds on and a participant holding `mediaChangeVirtualBackground` but not `mediaPublishVideo`
- **WHEN** they open the device setup screen and then join the meeting
- **THEN** neither the device setup screen nor the meeting offers background effects
