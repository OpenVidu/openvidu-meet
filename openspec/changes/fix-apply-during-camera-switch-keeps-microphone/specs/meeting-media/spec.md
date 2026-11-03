## MODIFIED Requirements

### Requirement: Applying the devices tried
While a pick in the meeting's Audio & video tab differs from the published device, the tab SHALL show an Apply button. Pressing it SHALL switch the published camera and microphone to the picked ones in one step, even if the panel closes or the tab changes before the switch ends, remember them as the selected devices and keep the background effect on the new camera. The button SHALL be disabled while the switch is in progress and SHALL disappear once nothing is left to apply.

#### Scenario: Applying a camera
- **GIVEN** participants A and B in a meeting, A trying the camera "Back" while publishing "Front"
- **WHEN** A presses Apply
- **THEN** B sees "Back"
- **AND** the Apply button disappears

#### Scenario: Applying a camera and a microphone at once
- **GIVEN** a participant in a meeting who picked another camera and another microphone in the Audio & video tab
- **WHEN** they press Apply once
- **THEN** the others receive both picked devices

#### Scenario: Closing the panel right after Apply
- **GIVEN** a participant in a meeting who picked another camera and another microphone in the Audio & video tab
- **WHEN** they press Apply and close the settings panel before the camera has switched
- **THEN** the others receive both picked devices
- **AND** reopening the Audio & video tab shows both picked devices in the selectors

#### Scenario: Applied device remembered
- **GIVEN** a participant who applied the camera "Back" in a meeting
- **WHEN** they open a meeting again in the same browser
- **THEN** "Back" is the camera opened

#### Scenario: Background effect kept
- **GIVEN** a participant publishing the camera "Front" with hard blur and trying the camera "Back"
- **WHEN** they press Apply
- **THEN** the others see "Back" with the blur

#### Scenario: Switch in progress
- **GIVEN** a participant trying another camera in the Audio & video tab
- **WHEN** they press Apply
- **THEN** the button is disabled until the camera has been switched
