# Spec Delta

## ADDED Requirements

### Requirement: Trying a device before applying it
In the meeting, picking a camera or a microphone in the Audio & video tab SHALL only change that tab: the camera preview SHALL show the picked camera, without the background effect and with a hint when one is applied, and the level meter SHALL follow the picked microphone. The others SHALL keep receiving the published devices. A picked device that cannot be opened SHALL leave them untouched, put the selector back and tell the participant.

#### Scenario: Trying another camera
- **GIVEN** participants A and B in a meeting, A publishing the camera "Front" and having a camera "Back" too
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

### Requirement: Applying the devices tried
While a pick in the meeting's Audio & video tab differs from the published device, the tab SHALL show an Apply button. Pressing it SHALL switch the published camera and microphone to the picked ones in one step, remember them as the selected devices and keep the background effect on the new camera. The button SHALL be disabled while the switch is in progress and SHALL disappear once nothing is left to apply.

#### Scenario: Applying a camera
- **GIVEN** participants A and B in a meeting, A trying the camera "Back" while publishing "Front"
- **WHEN** A presses Apply
- **THEN** B sees "Back"
- **AND** the Apply button disappears

#### Scenario: Applying a camera and a microphone at once
- **GIVEN** a participant in a meeting who picked another camera and another microphone in the Audio & video tab
- **WHEN** they press Apply once
- **THEN** the others receive both picked devices

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

### Requirement: Discarding a device that was not applied
A pick that has not been applied SHALL be discarded, closing its capture and showing the published device again in the selector and the preview, when the participant closes the settings panel, changes tab, leaves the meeting, turns that device off or picks the published device again, and when the picked device is disconnected. Discarding one device's pick SHALL NOT discard the other's.

#### Scenario: Closing the panel
- **GIVEN** a participant publishing the camera "Front" and trying the camera "Back"
- **WHEN** they close the settings panel
- **THEN** "Back" stops capturing
- **AND** reopening the Audio & video tab shows "Front" in the selector and the preview
- **AND** the others keep seeing "Front"

#### Scenario: Changing tab
- **GIVEN** a participant trying another microphone in the Audio & video tab
- **WHEN** they open the Layout tab and come back
- **THEN** the selector shows the published microphone and there is no Apply button

#### Scenario: Picking the published device again
- **GIVEN** a participant publishing the camera "Front" and trying the camera "Back"
- **WHEN** they pick "Front" again
- **THEN** "Back" stops capturing and the Apply button disappears
- **AND** "Front" is not reopened

#### Scenario: Turning the device off
- **GIVEN** a participant trying another camera and another microphone in the Audio & video tab
- **WHEN** they turn the camera off
- **THEN** the camera's pick is discarded
- **AND** the Apply button stays, for the microphone's pick

#### Scenario: The picked device is disconnected
- **GIVEN** a participant trying the camera "Back"
- **WHEN** "Back" is unplugged
- **THEN** the selector and the preview show the published camera again

## MODIFIED Requirements

### Requirement: Device selection
Once a device kind has been opened, the device setup screen and the Audio & video settings SHALL list its devices and let the participant switch without turning the device off, at once on the device setup screen and on Apply in the meeting. The selected camera and microphone SHALL be remembered per browser and used in later entries, while whether each device was on SHALL NOT be remembered. A switch to a device that cannot be opened SHALL go back to the previous device and tell the participant.

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

### Requirement: Audio and video settings
The Audio & video tab of the settings panel SHALL offer, for each device the participant may publish, an on and off switch and the device selector, plus a live preview and a shortcut to background effects for the camera, and a level meter for the microphone; the preview and the meter SHALL follow the device picked in the tab, and the tab SHALL offer an Apply button while a pick is not applied. A device that is off SHALL be shown as off.

#### Scenario: Checking the microphone
- **GIVEN** a participant in the meeting with the microphone on
- **WHEN** they open the Audio & video tab and speak
- **THEN** the microphone level meter moves with their voice

#### Scenario: Camera off in the settings
- **GIVEN** a participant whose camera is off
- **WHEN** they open the Audio & video tab
- **THEN** the camera area says the camera is off
- **AND** the camera selector is disabled

#### Scenario: Nothing to apply
- **GIVEN** a participant in the meeting who has not picked any device
- **WHEN** they open the Audio & video tab
- **THEN** the tab shows no Apply button

### Requirement: Capture profile
Every opening of the camera, including turning it back on, switching device and trying one in the meeting settings, SHALL ask for 1280x720 video, and every opening of the microphone SHALL ask for echo cancellation, noise suppression and automatic gain control.

#### Scenario: Opening the devices
- **GIVEN** a participant whose devices start on
- **WHEN** the device setup screen opens them
- **THEN** the camera is requested at 1280x720
- **AND** the microphone is requested with echo cancellation, noise suppression and automatic gain control

#### Scenario: Switching the microphone
- **GIVEN** a participant with two microphones
- **WHEN** they switch to the other one
- **THEN** the new microphone is requested with the same audio processing

#### Scenario: Trying a camera
- **GIVEN** a participant in the meeting with two cameras
- **WHEN** they pick the other one in the Audio & video tab
- **THEN** the camera tried is requested at 1280x720

### Requirement: Background effects
The background effects SHALL be no effect, soft blur, hard blur, and images grouped as Professional, Home Office and Creative. An effect SHALL apply at once to the participant's preview and to the video the others receive, on the device setup screen and in the meeting, except to the preview of a camera tried in the meeting settings and not applied yet; it SHALL NOT be selectable while the camera is off, and it SHALL keep reaching the others while the sender's window is minimised or covered.

#### Scenario: Applying an effect before joining
- **GIVEN** a participant with the camera on, on the device setup screen
- **WHEN** they open the background effects and choose hard blur
- **THEN** their preview shows the blurred background at once
- **AND** the meeting starts with the blur applied

#### Scenario: Camera turned off
- **GIVEN** a participant with the background effects panel open
- **WHEN** they turn the camera off
- **THEN** the panel closes and the background effects control is disabled

#### Scenario: Browser without support
- **GIVEN** a browser that cannot run background effects
- **WHEN** the participant opens the background effects
- **THEN** the panel says virtual backgrounds are not supported in this browser and offers no selectable effect

#### Scenario: Sender's window minimised
- **GIVEN** a participant in Firefox or Safari with a background effect applied
- **WHEN** they minimise their browser window
- **THEN** the others keep receiving their video with the effect
