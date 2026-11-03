# Embedded API Specification

## Purpose

The embedded API is the contract a host application uses to configure, drive and observe Meet once it is embedded: attributes in, commands in, events out. This capability holds the rules shared by every embedding mode (webcomponent, iframe and direct link) and every attribute, command and event; what each one does belongs to the feature that owns it.

Surfaces: the `<openvidu-meet>` element (attributes and properties, methods, DOM events, the `on`/`once`/`off` listener API), `postMessage` between a host page and Meet in an iframe, and the query parameters of a room or recording URL opened in an iframe or through a direct link. The wire contract is the TSDoc of `meet-ce/typings/src/embedded/` (`EmbeddedAttribute`, `EmbeddedCommandName`, `EmbeddedEventName` and their alias maps), published as the generated tables in openvidu.io `shared/meet/webcomponent/` and documented in `docs/meet/embedded/reference/webcomponent.md`, `iframe.md` and `direct-link.md`.

## Requirements

### Requirement: Attribute catalogue
Meet SHALL accept exactly the embedded attributes `room-url`, `recording-url`, `participant-name`, `participant-external-id`, `participant-metadata`, `initial-audio-active`, `initial-video-active`, `language`, `show-language-selector`, `e2ee-key`, `leave-redirect-url`, `show-only-recordings` and `show-recording`, each with the meaning its owning capability specifies.

#### Scenario: Owner of each attribute
- **WHEN** a reviewer looks up what an attribute does
- **THEN** `room-url`, `participant-name`, `participant-external-id`, `participant-metadata`, `initial-audio-active`, `initial-video-active` and `leave-redirect-url` are specified in `meeting-join`
- **AND** `recording-url`, `show-only-recordings` and `show-recording` in `recordings`
- **AND** `language` and `show-language-selector` in `localization`
- **AND** `e2ee-key` in `meeting-media`

### Requirement: The same attributes in every embedding mode
Meet SHALL accept every embedded attribute in every embedding mode: as an attribute or a property of `<openvidu-meet>`, and as a query parameter of the same name in the room or recording URL loaded by an iframe or a direct link. `room-url` and `recording-url` exist only on the element, where the iframe `src` or the link target plays their role.

#### Scenario: Webcomponent attribute
- **WHEN** a host renders `<openvidu-meet room-url="https://meet.example.com/meet/room/r-1?secret=s" participant-name="John">`
- **THEN** the join screen pre-fills the participant name with `John`

#### Scenario: Iframe query parameter
- **WHEN** a host loads an iframe whose `src` is `https://meet.example.com/meet/room/r-1?secret=s&participant-name=John`
- **THEN** the join screen pre-fills the participant name with `John`

#### Scenario: Direct link query parameter
- **WHEN** a person opens `https://meet.example.com/meet/room/r-1?secret=s&participant-name=John` in a browser tab
- **THEN** the join screen pre-fills the participant name with `John`

### Requirement: Attribute and property spellings
The embedded element SHALL expose each attribute also as a property named in camelCase (`room-url` is `roomUrl`, `participant-name` is `participantName`). An attribute and its property SHALL set the same value, the last write winning.

#### Scenario: Property written after the attribute
- **GIVEN** an element, not yet in the document, with `participant-name="Alice"`
- **WHEN** the host sets `element.participantName = "Bob"` and then inserts the element
- **THEN** the join screen pre-fills `Bob`

#### Scenario: Attribute written after the property
- **GIVEN** an element, not yet in the document, whose `participantName` property was set to `Bob`
- **WHEN** the host sets the attribute `participant-name="Carol"` and then inserts the element
- **THEN** the join screen pre-fills `Carol`

### Requirement: A room or recording URL is required
The embedded element SHALL need `room-url` or `recording-url`. With neither, or with a URL from which no room or recording identifier can be read, it SHALL show its embedded error screen and log the cause in the browser console. When `recording-url` is set, it SHALL show that recording whatever `room-url` says.

#### Scenario: Neither URL set
- **WHEN** a host renders `<openvidu-meet>` without `room-url` nor `recording-url`
- **THEN** the element shows its error screen
- **AND** the browser console warns that `room-url` or `recording-url` must be provided

#### Scenario: Both URLs set
- **WHEN** a host sets both `room-url` and `recording-url`
- **THEN** the element shows the recording of `recording-url`

### Requirement: Boolean attribute values
Meet SHALL read a boolean attribute (`initial-audio-active`, `initial-video-active`, `show-language-selector`, `show-only-recordings`), whether set on the element or as a query parameter of the iframe or direct link URL, as `false` only when its value is `false`; a bare attribute, an empty query parameter or any other value SHALL read as `true`. A boolean attribute that is not set SHALL leave the decision to the feature's own default.

#### Scenario: Explicit false
- **WHEN** a host sets `show-language-selector="false"`
- **THEN** Meet reads the attribute as `false`

#### Scenario: Bare attribute
- **WHEN** a host writes `<openvidu-meet room-url="..." show-only-recordings>`
- **THEN** Meet reads `show-only-recordings` as `true`

#### Scenario: Query parameter with another value
- **WHEN** an iframe loads `https://meet.example.com/meet/room/r-1?secret=s&show-only-recordings=1`
- **THEN** Meet reads `show-only-recordings` as `true` and shows the room recordings page

#### Scenario: Attribute not set
- **WHEN** a host leaves `initial-video-active` unset
- **THEN** the room's own `config.initialVideoActive` decides, as `meeting-join` specifies

### Requirement: Attribute changes after the element started
The embedded element SHALL move to a new target only when an attribute change alters what it shows: the room of `room-url`, the recording, or `show-only-recordings`. Any other attribute change SHALL NOT restart the meeting nor leave the current screen, and SHALL be used the next time the element enters the room.

#### Scenario: Name changed during the meeting
- **GIVEN** a participant in a meeting through the element
- **WHEN** the host changes `participant-name`
- **THEN** the meeting goes on and the participant keeps their name

#### Scenario: Room changed
- **GIVEN** a participant in a meeting of room A through the element
- **WHEN** the host sets `room-url` to an access URL of room B
- **THEN** the element leaves room A's meeting and shows the join screen of room B

### Requirement: Command catalogue
Meet SHALL accept exactly the commands `meetingLeave`, `meetingEnd`, `participantKick`, `participantMute`, `participantMuteAll`, `participantUpdateRole`, `participantHandRaise`, `participantHandLower`, `participantHandLowerAll`, `participantReactionSend`, `mediaToggleAudio`, `mediaToggleVideo`, `mediaToggleScreenShare`, `recordingStart`, `recordingStop`, `broadcastStart` and `broadcastStop`, and the deprecated `endMeeting`, `leaveRoom` and `kickParticipant`, each as its owner specifies.

#### Scenario: Owner of each command
- **WHEN** a reviewer looks up what a command does
- **THEN** `meetingLeave` is specified in `meeting-join`
- **AND** `meetingEnd` in `meetings`
- **AND** `participantKick`, `participantMute`, `participantMuteAll` and `participantUpdateRole` in `meeting-moderation`
- **AND** `participantHandRaise`, `participantHandLower` and `participantHandLowerAll` in `raise-hand`
- **AND** `participantReactionSend` in `reactions`
- **AND** `mediaToggleAudio`, `mediaToggleVideo` and `mediaToggleScreenShare` in `meeting-media`
- **AND** `recordingStart` and `recordingStop` in `recordings`
- **AND** `broadcastStart` and `broadcastStop` in `live-broadcast`
- **AND** `endMeeting`, `leaveRoom` and `kickParticipant` in this capability, as aliases

### Requirement: How a host sends a command
The embedded element SHALL expose each command as a method named after it, taking the command's parameters as arguments in the documented order. Meet in an iframe SHALL take each command as a `postMessage` to its window carrying `command`, set to the command name, and the parameters as named fields of `payload`. A direct link SHALL offer no commands.

#### Scenario: Webcomponent method
- **WHEN** a moderator's host calls `element.participantMute("p-1", { audioActive: false })`
- **THEN** participant `p-1`'s microphone is turned off

#### Scenario: Iframe message
- **WHEN** a moderator's host posts `{ command: "participantMute", payload: { participantIdentity: "p-1", media: { audioActive: false } } }` to the iframe's window
- **THEN** participant `p-1`'s microphone is turned off

### Requirement: Commands report no result
Meet SHALL give the host no result for a command: the element's methods SHALL return nothing and SHALL NOT throw because a command was rejected or failed, and the iframe SHALL send no reply. A command that fails while running, for example because the server refuses it, SHALL be logged in the browser console. The outcome of a command is observed through events and webhooks.

#### Scenario: Server refuses the action
- **GIVEN** a moderator in a meeting
- **WHEN** their host calls `participantKick` for an identity that is not in the meeting, which the server refuses
- **THEN** the method call completes without an exception and nobody is kicked
- **AND** the browser console logs the error with the command name

### Requirement: Commands run with the local participant's permissions
Meet SHALL run a command that declares a permission (its `@permission` in the typings) only when the local participant holds that permission when the command arrives, except `participantHandLower` for the own hand (see `raise-hand`); otherwise it SHALL reject the command, without effect, with a console warning naming it and the missing permission. The check SHALL be identical on every transport, and the server still enforces every permission (see `permissions`).

#### Scenario: Missing permission on the webcomponent
- **GIVEN** a speaker without `participantMute`
- **WHEN** their host calls `participantMute` for another participant
- **THEN** nobody is muted and the console warns that `participantMute` is missing

#### Scenario: Missing permission in an iframe
- **GIVEN** a speaker without `participantKick`
- **WHEN** their host posts `{ command: "participantKick", payload: { participantIdentity: "p-1" } }`
- **THEN** participant `p-1` stays in the meeting

#### Scenario: Permission gained during the meeting
- **GIVEN** a speaker promoted to moderator whose host has received `participantRoleChanged`
- **WHEN** the host calls `meetingEnd`
- **THEN** the meeting ends

### Requirement: Commands run only when the meeting phase allows them
Meet SHALL run `mediaToggleAudio` and `mediaToggleVideo` from the device setup screen (the prejoin screen of the reference, see `meeting-join`) onwards, and every other command only while the local participant is in the meeting, connected or reconnecting. A command received at any other moment SHALL be rejected with a console warning and SHALL NOT be kept for later.

#### Scenario: Media toggle on the device setup screen
- **GIVEN** the participant is on the device setup screen
- **WHEN** the host calls `mediaToggleVideo(false)`
- **THEN** the camera is turned off on the device setup screen

#### Scenario: Meeting command before joining
- **GIVEN** a moderator on the device setup screen
- **WHEN** the host calls `participantKick` for a participant in the meeting
- **THEN** nobody is kicked, and the command does not run once the moderator joins

#### Scenario: Command after leaving
- **GIVEN** the participant left and sees the end screen
- **WHEN** the host calls `meetingLeave` or `mediaToggleAudio`
- **THEN** nothing happens and the console warns that the command was rejected

#### Scenario: Command while reconnecting
- **GIVEN** a moderator whose connection to the meeting is being restored
- **WHEN** the host calls `meetingEnd`
- **THEN** Meet runs the command instead of rejecting it

### Requirement: Malformed commands are ignored
Meet SHALL ignore, without effect, a command whose required parameters are missing, logging it in the browser console, and SHALL ignore an iframe message whose `command` is not a string or not a command name.

#### Scenario: Kick without an identity
- **WHEN** a moderator's host posts `{ command: "participantKick" }` to the iframe
- **THEN** nobody is kicked and the console logs that `participantIdentity` is missing

#### Scenario: Unrelated messages
- **WHEN** a script on the host page posts `{ type: "analytics" }` or `{ command: "doSomething" }` to the iframe
- **THEN** Meet ignores both messages

### Requirement: Iframe commands are accepted only from the containing page
Meet in an iframe SHALL take the origin of the page that contains it from the browser (its ancestor origins, or the referrer where those are not available) and SHALL accept commands only from that origin. If no origin can be determined, it SHALL accept no command and post no event, and the meeting SHALL work otherwise unchanged.

#### Scenario: Command from the containing page
- **GIVEN** Meet loaded in an iframe of a page on `https://app.example.com`
- **WHEN** that page posts a `meetingLeave` command
- **THEN** the participant leaves the meeting

#### Scenario: Command from another origin
- **GIVEN** Meet loaded in an iframe of a page on `https://app.example.com`
- **WHEN** a window on another origin posts a `meetingEnd` command to the iframe
- **THEN** Meet ignores it and logs a warning naming that origin

#### Scenario: Containing origin unknown
- **GIVEN** Meet loaded in an iframe in a browser without ancestor origins and with the referrer suppressed
- **WHEN** the host posts commands and the participant joins and leaves
- **THEN** no command runs and no event is posted
- **AND** the participant can still join and use the meeting

### Requirement: Event catalogue
Meet SHALL emit exactly the events `meetingJoined`, `meetingLeft`, `participantJoined`, `participantLeft`, `participantRoleChanged`, `participantHandChanged`, `participantReactionSent`, `mediaAudioStatusChanged`, `mediaVideoStatusChanged`, `mediaScreenShareStatusChanged`, `recordingStatusChanged`, `broadcastStarted`, `broadcastUpdated`, `broadcastEnded` and `embeddedCloseRequested`, plus the deprecated `joined`, `left` and `closed`, each emitted as its owning capability specifies.

#### Scenario: Owner of each event
- **WHEN** a reviewer looks up when an event is emitted and what its payload means
- **THEN** `meetingJoined`, `meetingLeft` and `embeddedCloseRequested` are specified in `meeting-join`
- **AND** `participantJoined` and `participantLeft` in `meetings`
- **AND** `participantRoleChanged` in `meeting-moderation`
- **AND** `participantHandChanged` in `raise-hand`
- **AND** `participantReactionSent` in `reactions`
- **AND** `mediaAudioStatusChanged`, `mediaVideoStatusChanged` and `mediaScreenShareStatusChanged` in `meeting-media`
- **AND** `recordingStatusChanged` in `recordings`
- **AND** `broadcastStarted`, `broadcastUpdated` and `broadcastEnded` in `live-broadcast`
- **AND** `joined`, `left` and `closed` in this capability, as aliases

### Requirement: Events only in embedded modes
Meet SHALL emit embedded events only when it runs as the webcomponent or inside an iframe. A page opened through a direct link SHALL emit none.

#### Scenario: Direct link
- **GIVEN** a participant who opened a room URL in a browser tab
- **WHEN** they join and leave the meeting
- **THEN** no embedded event is emitted to any window

### Requirement: Webcomponent events are DOM events
The embedded element SHALL dispatch each event as a `CustomEvent` on the `<openvidu-meet>` element, whose type is the event name and whose `detail` is the payload; an event without payload SHALL carry no `detail`.

#### Scenario: Listen with addEventListener
- **GIVEN** a host that called `element.addEventListener("meetingJoined", handler)`
- **WHEN** the participant joins the meeting
- **THEN** `handler` receives a `CustomEvent` whose `detail` carries `roomId` and `participantIdentity`

### Requirement: Iframe events are messages to the containing page
Meet in an iframe SHALL post each event to the containing window as a message `{ event, payload }`, targeted at the containing page's origin only and never at every origin; an event without payload SHALL have no `payload` field.

#### Scenario: Event message
- **GIVEN** Meet in an iframe of a page on `https://app.example.com`
- **WHEN** the participant asks to close Meet from the end screen
- **THEN** the page receives a message from Meet's origin whose data is `{ event: "embeddedCloseRequested" }`

### Requirement: Events arrive in order and none is lost
Meet SHALL deliver the events of one element or iframe in the order they were produced, without dropping any, including events produced at the same moment.

#### Scenario: Several events at the moment of joining
- **GIVEN** a meeting with two raised hands
- **WHEN** a participant joins it through the element
- **THEN** the host receives `meetingJoined` and then both `participantHandChanged` events, in queue order, with none missing

### Requirement: Listener API
The embedded element SHALL offer `on(event, callback)`, `once(event, callback)` and `off(event, callback?)`. The callback SHALL receive the payload itself, not the DOM event; `on` and `once` SHALL return the element so calls can be chained; a `once` callback SHALL be removed after its first call; `off` with a callback SHALL remove that callback, and without one every callback added with `on` or `once` for that event, leaving listeners added with `addEventListener` untouched.

#### Scenario: on receives the payload
- **WHEN** a host calls `element.on("meetingLeft", (payload) => ...)` and the participant leaves
- **THEN** the callback receives the payload, with `reason` at its top level

#### Scenario: once fires once
- **GIVEN** a callback registered with `once("mediaAudioStatusChanged", callback)`
- **WHEN** the microphone is turned off and then on
- **THEN** the callback runs only for the first change

#### Scenario: off without a callback
- **GIVEN** two callbacks added with `on("participantJoined", ...)` and one listener added with `addEventListener("participantJoined", ...)`
- **WHEN** the host calls `off("participantJoined")`
- **THEN** only the `addEventListener` listener is called for the next arrival

### Requirement: Shared payload conventions
Meet SHALL send the `participant*` events with the meeting's `roomId` and the participant under `participant`, never with `roomName`. An event that attributes its change SHALL carry `origin`, whose value is `participant`, `moderator` or `system`.

#### Scenario: Hand lowered by a moderator
- **WHEN** a moderator lowers another participant's hand
- **THEN** the `participantHandChanged` payload carries `roomId`, `participant` and `origin: "moderator"`, and no `roomName`

### Requirement: Deprecated command names until 3.12.0
Until their removal in 3.12.0, Meet SHALL accept the 3.8.0 command names `endMeeting`, `leaveRoom` and `kickParticipant` as `meetingEnd`, `meetingLeave` and `participantKick`, with the same parameters, permission and availability, both as element methods and as iframe `command` values.

#### Scenario: Deprecated method
- **WHEN** a moderator's host calls `element.kickParticipant("p-1")`
- **THEN** participant `p-1` is kicked, exactly as with `participantKick("p-1")`

#### Scenario: Deprecated iframe command keeps its gating
- **GIVEN** a speaker without `meetingEnd`
- **WHEN** their host posts `{ command: "endMeeting" }`
- **THEN** the meeting goes on and the console warns that `meetingEnd` is missing

### Requirement: Deprecated event names until 3.12.0
Until their removal in 3.12.0, Meet SHALL dispatch the 3.8.0 events `joined`, `left` and `closed` right after each `meetingJoined`, `meetingLeft` and `embeddedCloseRequested`, with the same payload, on the element and over `postMessage`, so a host listening to both names is called twice.

#### Scenario: Both names dispatched
- **GIVEN** a host listening to `left` and to `meetingLeft`
- **WHEN** the participant leaves with reason `voluntary_leave`
- **THEN** the host receives `meetingLeft` and then `left`, both with reason `voluntary_leave`

#### Scenario: Two messages in an iframe
- **WHEN** the participant joins the meeting in an iframe
- **THEN** the containing page receives a message with `event: "meetingJoined"` followed by one with `event: "joined"` and the same payload

### Requirement: Listener callbacks are registered once per event
The embedded element SHALL register a callback at most once per event through `on` and `once`: a call with a callback already registered for that event, by either method and not yet removed, SHALL have no effect, so the callback runs once per event and a single `off` with that callback removes it.

#### Scenario: Same callback registered twice
- **GIVEN** a host that called `element.on("participantJoined", callback)` twice
- **WHEN** a participant joins
- **THEN** `callback` runs once

#### Scenario: Removing a callback registered twice
- **GIVEN** a host that called `element.on("participantJoined", callback)` twice and then `element.off("participantJoined", callback)`
- **WHEN** a participant joins
- **THEN** `callback` does not run
