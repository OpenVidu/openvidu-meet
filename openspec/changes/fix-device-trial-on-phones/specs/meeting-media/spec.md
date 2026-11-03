## ADDED Requirements

### Requirement: Where devices can be tried
The meeting SHALL offer trying a device before applying it only where the browser can capture a second device of that kind while the published one stays live: never on Android, iOS or iPadOS phones and tablets, and not for the microphone in Safari. There a pick in the Audio & video tab SHALL switch the published device at once, as on the device setup screen, and no Apply button SHALL appear.

#### Scenario: Switching camera on a phone
- **GIVEN** participants A and B in a meeting, A on an Android phone publishing the camera "Front"
- **WHEN** A picks the camera "Back" in the Audio & video tab
- **THEN** B sees "Back"
- **AND** the tab shows no Apply button

#### Scenario: Switching camera on an iPhone
- **GIVEN** participants A and B in a meeting, A on an iPhone publishing the camera "Front"
- **WHEN** A picks the camera "Back" in the Audio & video tab
- **THEN** B sees "Back"
- **AND** A's camera is never shown muted to B while the pick is made

#### Scenario: Switching the microphone in Safari
- **GIVEN** participants A and B in a meeting, A in Safari on a computer publishing the microphone "Laptop"
- **WHEN** A picks the microphone "Headset" in the Audio & video tab
- **THEN** B hears A through "Headset"
- **AND** the tab shows no Apply button

#### Scenario: Trying a camera in Safari on a computer
- **GIVEN** a participant in Safari on a computer publishing the camera "Built-in" and having a camera "USB" too
- **WHEN** they pick "USB" in the Audio & video tab
- **THEN** the preview shows "USB" and the tab shows an Apply button
- **AND** the others keep seeing "Built-in"

## MODIFIED Requirements

### Requirement: Trying a device before applying it
In the meeting, where devices can be tried, picking a camera or a microphone in the Audio & video tab SHALL only change that tab: the camera preview SHALL show the picked camera, without the background effect and with a hint when one is applied, and the level meter SHALL follow the picked microphone. The others SHALL keep receiving the published devices. A picked device that cannot be opened SHALL leave them untouched, put the selector back and tell the participant.

#### Scenario: Trying another camera
- **GIVEN** participants A and B in a meeting, A on a computer publishing the camera "Front" and having a camera "Back" too
- **WHEN** A picks "Back" in the Audio & video tab
- **THEN** A's preview shows "Back"
- **AND** B keeps seeing "Front"
- **AND** the tab shows an Apply button

#### Scenario: Trying another microphone
- **GIVEN** participants A and B in a meeting, A publishing the microphone "Laptop" and having a microphone "Headset" too
- **WHEN** A picks "Headset" in the Audio & video tab and speaks into it
- **THEN** the level meter moves with the headset
- **AND** B keeps hearing A through "Laptop"

#### Scenario: Trying a camera with a background effect applied
- **GIVEN** a participant publishing the camera "Front" with hard blur
- **WHEN** they pick the camera "Back" in the Audio & video tab
- **THEN** the preview shows "Back" without the blur
- **AND** a hint says the background effect applies once the camera is applied
- **AND** the others keep seeing "Front" with the blur

#### Scenario: The picked camera cannot be opened
- **GIVEN** a participant publishing the camera "Front", and a camera "Back" held by another application
- **WHEN** they pick "Back" in the Audio & video tab
- **THEN** the selector and the preview show "Front" again
- **AND** a notice says the camera could not be started
- **AND** the others keep seeing "Front" without interruption

### Requirement: Device selection
Once a device kind has been opened, the device setup screen and the Audio & video settings SHALL list its devices and let the participant switch without turning the device off, at once, or on Apply where the meeting lets them try it first. The selected camera and microphone SHALL be remembered per browser and used in later entries, while whether each device was on SHALL NOT be remembered. A switch to a device that cannot be opened SHALL go back to the previous device and tell the participant.

#### Scenario: Selection carried into the meeting
- **GIVEN** a participant who picks another camera on the device setup screen
- **WHEN** they join the meeting
- **THEN** the meeting publishes the picked camera without opening the default one

#### Scenario: Returning participant
- **GIVEN** a participant who picked another camera in an earlier entry in the same browser
- **WHEN** they open a meeting again
- **THEN** the picked camera is the one opened

#### Scenario: On and off state is not remembered
- **GIVEN** a participant who turned their camera off on the device setup screen
- **WHEN** they reload the page
- **THEN** the camera starts in the room's initial state again

#### Scenario: Picking the device in use
- **GIVEN** a participant whose camera is on
- **WHEN** they pick the camera already in use
- **THEN** the camera is not reopened
- **AND** in the meeting, no Apply button appears

#### Scenario: The picked device cannot be opened
- **GIVEN** a participant whose camera is on
- **WHEN** they pick a camera that cannot be opened
- **THEN** the capture goes back to the previous camera
- **AND** a notice says the camera could not be started

#### Scenario: A device is plugged in
- **GIVEN** a participant in the meeting
- **WHEN** they connect another camera to their computer
- **THEN** the camera list includes it
