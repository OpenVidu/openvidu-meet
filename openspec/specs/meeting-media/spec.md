# Meeting Media Specification

## Purpose

Defines how a participant publishes and controls their camera, microphone and screen share, how they see and hear the other participants, and the media features around them: device selection, microphone warnings, virtual backgrounds, end-to-end encryption and reconnection. Participants, room managers and embedding hosts rely on it.

Surfaces: the meeting UI (device setup screen, toolbar, Audio & video tab of the settings panel, background effects panel, video tiles, participants panel), the embedded commands `mediaToggleAudio`, `mediaToggleVideo` and `mediaToggleScreenShare`, the embedded events `mediaAudioStatusChanged`, `mediaVideoStatusChanged` and `mediaScreenShareStatusChanged`, the embedded attribute `e2ee-key` (TSDoc in `meet-ce/typings/src/embedded/`), the permissions `mediaPublishAudio`, `mediaPublishVideo`, `mediaShareScreen` and `mediaChangeVirtualBackground`, and the room config fields `virtualBackground.enabled` and `e2ee.enabled`. The device setup screen is the one the embedded API reference calls the prejoin screen: it follows the join screen (see `meeting-join`) and precedes the meeting. Documented in openvidu.io `docs/meet/features/meetings/virtual-background.md` and `docs/meet/features/meetings/e2e-encryption.md`, and in the embedded API reference generated into `shared/meet/webcomponent/`.

## Requirements

### Requirement: Media controls follow the permissions
The meeting SHALL offer the camera control only with `mediaPublishVideo`, the microphone control only with `mediaPublishAudio` and the screen share control only with `mediaShareScreen`, on the device setup screen, in the toolbar and in the settings panel, following permission changes during the meeting. A denied media permission SHALL keep that device off whatever the initial state (see `meeting-join`); the media server refuses what is denied (see `permissions`).

#### Scenario: Microphone not allowed
- **GIVEN** a participant whose permissions deny `mediaPublishAudio`
- **WHEN** they reach the device setup screen and then the meeting
- **THEN** neither screen shows a microphone control
- **AND** they join with the microphone off

#### Scenario: No device allowed
- **GIVEN** a participant whose permissions deny both `mediaPublishAudio` and `mediaPublishVideo`
- **WHEN** they open the settings panel in the meeting
- **THEN** the panel has no Audio & video tab

#### Scenario: Permission revoked mid-meeting
- **GIVEN** a participant publishing their camera
- **WHEN** `mediaPublishVideo` is revoked from them during the meeting
- **THEN** the camera button disappears from their toolbar
- **AND** their camera is no longer published

### Requirement: Devices are opened once per entry
Meet SHALL open only the devices that start on for this entry (see `meeting-join` for the initial state), asking for the camera and the microphone in a single browser request, so the browser prompts for permission once. A device that starts off SHALL NOT be opened, nor its permission requested, until the participant turns it on, and turning it on SHALL open it exactly once.

#### Scenario: Both devices start on
- **GIVEN** a participant whose camera and microphone start on
- **WHEN** the device setup screen opens
- **THEN** the camera and the microphone are requested together in one browser request

#### Scenario: Room that starts with media off
- **GIVEN** a room with `initialAudioActive` and `initialVideoActive` set to `false`, visited for the first time in a browser
- **WHEN** the device setup screen opens
- **THEN** no device is opened and no permission is requested
- **AND** the camera and microphone toggles are enabled, without any "device not found" message

#### Scenario: Turning the camera on later
- **GIVEN** a participant whose camera started off
- **WHEN** they turn it on
- **THEN** the camera is opened once and its preview shows

### Requirement: A device that cannot be opened
When a device exists but cannot be opened, for example because another application holds it, Meet SHALL still open the other device, SHALL show the failed one as off, and SHALL tell the participant: inline when the device setup screen opens, and in a notice shown for 10 seconds when turning the device on later fails. The participant SHALL still be able to join.

#### Scenario: Camera busy on the device setup screen
- **GIVEN** a camera held by another application
- **WHEN** the device setup screen opens with both devices meant to start on
- **THEN** the microphone is on and the camera shows off
- **AND** a message says the camera could not be started
- **AND** the join button stays enabled, and joining publishes the microphone only

#### Scenario: Both devices busy
- **GIVEN** a camera and a microphone both held by another application
- **WHEN** the device setup screen opens
- **THEN** both devices show off and the message names both
- **AND** both devices are still listed, not reported as missing

#### Scenario: Turning the camera on fails in the meeting
- **GIVEN** a participant in the meeting whose camera is off and now held by another application
- **WHEN** they turn the camera on
- **THEN** the camera stays off
- **AND** a notice says the camera could not be started

### Requirement: No devices or no browser permission
When the browser exposes no camera or no microphone, because none is connected or media permission was denied, the meeting SHALL disable that device's control and show a "device not found" message on the device setup screen and in the Audio & video settings, and the participant SHALL still be able to join without that device.

#### Scenario: Media permission denied
- **GIVEN** a browser that denies media permission to Meet
- **WHEN** the participant goes through the device setup screen and joins
- **THEN** the device setup screen shows the camera and microphone as not found
- **AND** the camera and microphone buttons of the meeting toolbar are disabled
- **AND** the Audio & video settings show both devices as not found

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

### Requirement: Microphone audio quality
The microphone SHALL be published at speech quality, with the audio encoder capped at 24 kbps, and SHALL keep silence suppression and, outside end-to-end encrypted rooms, redundant audio against packet loss. The audio of a shared screen SHALL NOT be capped at that speech bitrate.

#### Scenario: Speaking
- **GIVEN** a participant publishing their microphone in a room without end-to-end encryption
- **WHEN** they speak
- **THEN** their microphone audio is encoded at 24 kbps at most
- **AND** each audio packet also carries the previous audio frame

#### Scenario: Packet loss
- **GIVEN** a participant who receives another participant's microphone with 3% of the packets lost
- **WHEN** the other participant speaks
- **THEN** the lost audio is recovered from the redundant frames, without audible gaps

#### Scenario: Sharing a tab with sound
- **GIVEN** a participant sharing a browser tab with its audio
- **WHEN** the tab plays music
- **THEN** the tab audio is published without the 24 kbps speech cap

### Requirement: Turning a device off mutes it
Turning the camera or the microphone off SHALL mute its published track instead of unpublishing it, and turning it back on SHALL unmute the same publication. Turning the camera off SHALL stop capturing it, so the camera light goes off; the microphone SHALL keep capturing while muted, which is what the microphone warnings listen to.

#### Scenario: Camera off in the meeting
- **GIVEN** a participant publishing their camera
- **WHEN** they turn the camera off
- **THEN** their camera track stays published, muted
- **AND** the camera stops capturing
- **AND** the others see the participant's avatar on their tile

#### Scenario: Microphone off in the meeting
- **GIVEN** a participant publishing their microphone
- **WHEN** they mute it
- **THEN** their microphone track stays published, muted
- **AND** the microphone keeps capturing on their device

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

### Requirement: Speaking while muted warning
While the microphone is muted, the device setup screen and the meeting SHALL warn the participant, pointing at the microphone button, when sustained speech is picked up, and SHALL NOT warn for background noise or silence. The warning SHALL stay until the participant dismisses it or toggles the microphone, and toggling SHALL re-arm it for the next muted period.

#### Scenario: Speaking while muted
- **GIVEN** a participant in the meeting with the microphone muted
- **WHEN** they speak
- **THEN** a warning next to the microphone button asks whether they are talking with the microphone off

#### Scenario: Background noise
- **GIVEN** a participant with the microphone muted in a room with only background noise
- **WHEN** some time passes
- **THEN** no warning is shown

#### Scenario: Dismissed warning
- **GIVEN** a participant who dismissed the speaking while muted warning
- **WHEN** they keep speaking with the microphone muted
- **THEN** the warning does not come back until they toggle the microphone

### Requirement: Microphone muted by the system
When the operating system mutes the microphone input, the device setup screen and the meeting SHALL warn the participant and mark the microphone button, and the mark SHALL stay while the input stays muted, even after the warning is dismissed. This warning SHALL take precedence over the speaking while muted one, and both warnings SHALL carry over from the device setup screen into the meeting.

#### Scenario: Muted by the system
- **GIVEN** a participant whose operating system mutes the microphone input
- **WHEN** they are on the device setup screen
- **THEN** a warning says the microphone is muted by the system
- **AND** the microphone button carries a warning mark

#### Scenario: Carried into the meeting
- **GIVEN** a participant shown the system muted warning on the device setup screen
- **WHEN** they join the meeting
- **THEN** the meeting shows the same warning

### Requirement: Screen sharing
A participant with `mediaShareScreen` SHALL be able to start and stop sharing a screen, window or tab from the meeting toolbar, with its audio when the browser offers it. Screen sharing SHALL NOT be offered on the device setup screen nor on Android and iOS devices. Stopping the share from the browser's own control SHALL stop it in the meeting, and sharing SHALL NOT change the camera or microphone state.

#### Scenario: Sharing with the microphone muted
- **GIVEN** a participant in the meeting with the microphone muted
- **WHEN** they share their screen
- **THEN** their screen is published
- **AND** their microphone stays muted

#### Scenario: Stopped from the browser
- **GIVEN** a participant sharing their screen
- **WHEN** they stop it from the browser's own sharing control
- **THEN** the share ends in the meeting for everyone

#### Scenario: Phone
- **GIVEN** a participant on an Android or iOS device
- **WHEN** they look at the meeting toolbar
- **THEN** it offers no screen share button

### Requirement: Replacing the shared screen
While a participant shares their screen, the screen share button SHALL open a menu to replace the shared screen with another one without ending the share, or to stop sharing. In Firefox the button SHALL stop the share directly.

#### Scenario: Replacing the screen
- **GIVEN** a participant sharing a browser tab in Chrome
- **WHEN** they choose to replace the screen and pick a window
- **THEN** the others see the window in the same screen share tile

### Requirement: Media state of the other participants
Every participant SHALL see the media state of the others, updated live: a camera tile SHALL show the participant's avatar while their camera is off and a microphone-off mark while they are muted, and the participants panel SHALL show the microphone, camera and screen share state of each participant.

#### Scenario: A participant changes devices
- **GIVEN** participants A and B, with A's participants panel open
- **WHEN** B turns the camera off, starts sharing and mutes the microphone
- **THEN** A's panel shows B's camera off, B sharing the screen and B's microphone off, without reopening the panel
- **AND** A sees B's avatar on B's camera tile

### Requirement: Muting another participant for oneself
A participant SHALL be able to silence another participant's audio, or the audio of their screen share, for themselves only, from that tile's controls or from the participants panel, and undo it; the tile SHALL show it is muted for them. Nobody else's audio SHALL change.

#### Scenario: Muting for oneself
- **GIVEN** participants A, B and C
- **WHEN** A mutes B for themselves from the participants panel
- **THEN** A stops hearing B and B's row says B is muted for A only
- **AND** C still hears B

### Requirement: Connection quality
Each camera tile SHALL show its participant's connection quality for 3 seconds whenever it becomes good or excellent, and for as long as it is poor or lost. A participants panel row SHALL show it only while it is poor or lost.

#### Scenario: Healthy connection
- **GIVEN** a participant who just joined with a good connection
- **WHEN** the connection quality is first reported
- **THEN** their tile shows the quality badge, which hides after 3 seconds
- **AND** their participants panel row shows no badge

### Requirement: Embedded commands for the local devices
`mediaToggleAudio` and `mediaToggleVideo` SHALL set the local microphone or camera to `active` when it is a boolean and toggle it otherwise, from the device setup screen onwards; `mediaToggleScreenShare` SHALL do the same for the screen share once the meeting is joined. A command SHALL be ignored when the local participant lacks `mediaPublishAudio`, `mediaPublishVideo` or `mediaShareScreen` respectively; the rules shared by every command are in `embedded-api`.

#### Scenario: Muting before joining
- **GIVEN** an embedded participant on the device setup screen with the microphone on
- **WHEN** the host calls `mediaToggleAudio` with `active` set to `false`
- **THEN** the device setup screen shows the microphone off
- **AND** the participant joins with the microphone muted

#### Scenario: Toggling without a value
- **GIVEN** an embedded participant in the meeting with the camera on
- **WHEN** the host calls `mediaToggleVideo` without `active`
- **THEN** the camera turns off
- **AND** a second call turns it back on

#### Scenario: Already in the requested state
- **GIVEN** an embedded participant whose microphone is on
- **WHEN** the host calls `mediaToggleAudio` with `active` set to `true`
- **THEN** nothing changes

#### Scenario: Screen share before joining
- **GIVEN** an embedded participant on the device setup screen
- **WHEN** the host calls `mediaToggleScreenShare`
- **THEN** the command is ignored

#### Scenario: Permission missing
- **GIVEN** an embedded participant whose permissions deny `mediaPublishVideo`
- **WHEN** the host calls `mediaToggleVideo` with `active` set to `true`
- **THEN** the command is ignored and the camera stays off

### Requirement: Media status events
In the embedded modes, Meet SHALL emit `mediaAudioStatusChanged`, `mediaVideoStatusChanged` and `mediaScreenShareStatusChanged` for the local participant only, once per change of that device's state, from the device setup screen onwards. The state a device starts in SHALL NOT be reported, a state reported on the device setup screen SHALL NOT be repeated when the participant joins, and a command asking for the current state SHALL emit nothing.

#### Scenario: One event per transition
- **GIVEN** an embedded participant in the meeting with the microphone on
- **WHEN** they mute and then unmute it
- **THEN** the host receives two `mediaAudioStatusChanged` events, `active` `false` then `true`

#### Scenario: Change on the device setup screen
- **GIVEN** an embedded participant on the device setup screen with the camera on
- **WHEN** they turn the camera off and join
- **THEN** the host receives one `mediaVideoStatusChanged` with `active` `false` before `meetingJoined`
- **AND** no further camera event when the meeting is joined

#### Scenario: Screen share
- **GIVEN** an embedded participant in the meeting
- **WHEN** they start and then stop sharing their screen
- **THEN** the host receives `mediaScreenShareStatusChanged` with `active` `true` and then `false`

#### Scenario: Remote participant
- **GIVEN** an embedded participant in a meeting with another participant
- **WHEN** the other participant turns their camera off
- **THEN** the host receives no media status event

### Requirement: Origin of media status events
A media status event SHALL carry `origin` `participant` when the local participant changed the device, from the meeting interface or through their host's command, and `moderator` when a moderator turned it off (see `meeting-moderation`). Only the muted participant's host SHALL receive the event.

#### Scenario: Muted by a moderator
- **GIVEN** an embedded participant with the microphone on
- **WHEN** a moderator turns their microphone off
- **THEN** their host receives `mediaAudioStatusChanged` with `active` `false` and `origin` `moderator`
- **AND** the moderator's host receives no media status event

#### Scenario: Muted from the meeting interface
- **GIVEN** an embedded participant with the microphone on
- **WHEN** they mute it from the toolbar
- **THEN** their host receives `mediaAudioStatusChanged` with `origin` `participant`

### Requirement: Where background effects are offered
The meeting SHALL offer background effects only in a room whose `virtualBackground.enabled` is `true`, its default, and only to participants with `mediaChangeVirtualBackground`. Where they are not offered, no remembered effect SHALL be applied, and losing the permission during the meeting SHALL remove an applied effect, closing the background effects panel.

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

### Requirement: Background effect remembered
The chosen background effect SHALL be remembered per browser and applied again on the device setup screen and when joining any meeting where background effects are offered.

#### Scenario: Next meeting
- **GIVEN** a participant who chose an image background in an earlier meeting in the same browser
- **WHEN** they open another meeting that offers background effects
- **THEN** the device setup screen already shows that image background

### Requirement: End-to-end encrypted rooms
A room whose `e2ee.enabled` is `true` SHALL have its meetings end-to-end encrypted; the field defaults to `false`. An encrypted room SHALL never be recorded, which `recordings` specifies, so its meeting offers no recording control.

#### Scenario: Default
- **GIVEN** a `createRoom` request whose config omits `e2ee`
- **WHEN** the room is created
- **THEN** its `config.e2ee.enabled` is `false`

#### Scenario: No recording control
- **GIVEN** a room with `e2ee.enabled` set to `true`
- **WHEN** a participant allowed to record joins its meeting with the encryption key
- **THEN** the meeting offers no control to start a recording

### Requirement: Encryption key of an encrypted meeting
A participant SHALL join a meeting of an encrypted room only with an encryption key, typed on the join screen or given by the `e2ee-key` attribute or query parameter (the join screen and the address bar belong to `meeting-join`), and their media, chat and name SHALL be encrypted and decrypted with it. An `e2ee-key` given for a room whose `e2ee.enabled` is `false` SHALL be ignored.

#### Scenario: No encryption key
- **GIVEN** a room with `e2ee.enabled` set to `true`
- **WHEN** a participant opens its join screen without `e2ee-key`
- **THEN** they cannot join until they type an encryption key

#### Scenario: Encryption key from the host
- **GIVEN** an encrypted room embedded with `participant-name` and `e2ee-key` set
- **WHEN** the participant joins
- **THEN** their meeting is encrypted with the encryption key the host gave, without them typing it

#### Scenario: Room that is not encrypted
- **GIVEN** a room with `e2ee.enabled` set to `false`
- **WHEN** a participant enters it with an `e2ee-key`
- **THEN** the meeting is not encrypted
- **AND** the status rail shows no encrypted mark

### Requirement: Participants sharing an encryption key
Participants who joined with the same encryption key SHALL see and hear each other, read each other's chat messages and see each other's names as usual, while their audio, video, screen share, chat messages and display names are encrypted on their devices before they leave them. The status rail SHALL show that the meeting is end-to-end encrypted (see `meeting-layout`).

#### Scenario: Same encryption key
- **GIVEN** two participants who joined an encrypted room with the same encryption key
- **WHEN** they turn on their cameras and exchange chat messages
- **THEN** each sees the other's video, name and messages
- **AND** the status rail shows the encrypted mark

### Requirement: Mismatched encryption key
A participant whose encryption key differs from another's SHALL see that participant's tile as an encryption error instead of their video, with the name masked as `******` in the grid and the participants panel, and SHALL NOT read that participant's chat messages (see `meeting-chat`). The lockout SHALL be symmetric, and the meeting SHALL go on for the participants who share an encryption key.

#### Scenario: One wrong encryption key
- **GIVEN** participants A and C with one encryption key and participant B with another in the same encrypted meeting
- **WHEN** all three are connected
- **THEN** B sees A and C as encryption errors with masked names
- **AND** A and C see B as an encryption error and see each other normally

### Requirement: Encrypted names reach the server encrypted
In an encrypted room, a participant's display name SHALL be encrypted before it leaves their device, so the server, its REST responses and its webhooks only ever hold the encrypted name. `participant-external-id` and `participant-metadata` SHALL NOT be encrypted.

#### Scenario: Webhook of an encrypted meeting
- **GIVEN** an embedded participant joining an encrypted room with `participant-name`, `participant-external-id` and an `e2ee-key`
- **WHEN** the `participantJoined` webhook is delivered
- **THEN** it carries the participant's name encrypted
- **AND** it carries the external id as the host set it

### Requirement: Reconnection
When the connection to the meeting drops and Meet has to reconnect fully, the meeting SHALL show a blocking "connection lost, reconnecting" dialog, SHALL disable the media and panel buttons and close any open panel, and once reconnected SHALL close the dialog and resume the participant's media in the state it was in. A resume of the signalling connection alone SHALL be transparent: no dialog and no interruption of the media.

#### Scenario: Full reconnect
- **GIVEN** a participant in the meeting with the camera on, the microphone muted and the chat panel open
- **WHEN** their connection drops and Meet reconnects fully
- **THEN** a blocking dialog says the connection was lost and Meet is trying to reconnect, and the chat panel closes
- **AND** after reconnecting the dialog closes, the camera is published again and the microphone is still muted

#### Scenario: Signalling resume
- **GIVEN** a participant in the meeting
- **WHEN** only their signalling connection drops and resumes
- **THEN** no dialog is shown and their media keeps flowing

### Requirement: Device buttons wait for the change in progress
While turning the camera or the microphone on or off from the meeting toolbar is in progress, that device's toolbar button SHALL be disabled, and it SHALL be enabled again once the change has been applied or has failed.

#### Scenario: Microphone change in progress
- **GIVEN** a participant in a meeting with the microphone on
- **WHEN** they press the microphone button
- **THEN** the button is disabled until the microphone is muted
- **AND** it is enabled again afterwards

#### Scenario: Camera change in progress
- **GIVEN** a participant in a meeting with the camera off
- **WHEN** they press the camera button
- **THEN** the button is disabled until the camera is on
- **AND** it is enabled again afterwards

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
