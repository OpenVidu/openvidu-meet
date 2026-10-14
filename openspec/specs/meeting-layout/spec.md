# Meeting Layout Specification

## Purpose

Defines how the meeting view arranges the participants' video on each participant's own screen (Mosaic and Smart Mosaic, pinning, the floating own video), which camera video each viewer receives as a result, and where the meeting's status rail, toolbar, side panels and notifications sit across screen sizes. Participants rely on it to follow a meeting comfortably on any device.

Surfaces: the meeting UI only (video grid and tiles, Layout tab of the settings panel, status rail, toolbar, side panels, notifications); there is no REST or embedded API for the layout, and every layout choice is local to the viewer. Documented in openvidu.io `docs/meet/features/meetings/smart-layout.md`.

## Requirements

### Requirement: The layout is each viewer's own
Every layout choice (mode, number of visible participants, pins, floating or docked own video, zoom) SHALL change only the screen of the participant who makes it; no other participant's layout SHALL change.

#### Scenario: Pinning a participant
- **GIVEN** participants A, B and C in a meeting
- **WHEN** A pins B's video
- **THEN** B is enlarged on A's screen
- **AND** the layouts of B and C do not change

### Requirement: Responsive grid
The meeting SHALL arrange the visible tiles in a grid that adapts to how many there are and to the space available, with every tile of the same size, separated by the same gap, and a short last row centred rather than enlarged. The whole grid SHALL fit the screen of a 320 px wide phone, and on desktop and tablet-landscape windows a camera tile SHALL never be taller than 4:3.

#### Scenario: Participants join
- **GIVEN** a participant alone in a desktop meeting window
- **WHEN** two and then three other participants join
- **THEN** the grid re-arranges each time into equal tiles that fill the available space
- **AND** no camera tile is taller than 4:3

#### Scenario: Narrow phone
- **GIVEN** a phone whose screen is 320 px wide
- **WHEN** its participant joins a meeting
- **THEN** every tile of the grid lies within the screen

### Requirement: Tiles
Each tile SHALL show the participant's name, and a screen share tile SHALL add "(your screen)" for the sharer and "(screen)" for everyone else. A camera SHALL fill its tile while a shared screen SHALL be shown whole, the viewer's own camera SHALL be mirrored for them, and a speaking participant's tile SHALL be highlighted. A tile's controls SHALL appear when the pointer moves over it and hide 2 seconds after it stops.

#### Scenario: Own screen share
- **GIVEN** participant A sharing their screen with participant B
- **WHEN** both look at the screen share tile
- **THEN** A sees it labelled as their screen
- **AND** B sees it labelled as A's screen

#### Scenario: Tile controls
- **GIVEN** a participant hovering a tile
- **WHEN** the pointer rests outside the controls for 2 seconds
- **THEN** the tile controls hide

### Requirement: Layout modes
The meeting SHALL offer two layout modes in the Layout tab of the settings panel, which More options > Adjust layout opens directly: Mosaic, which shows every remote participant in equal tiles, and Smart Mosaic, the default, which shows a limited number of remote participants and prioritises those who speak. Switching between them SHALL keep the tiles that stay visible where they were.

#### Scenario: Default mode
- **GIVEN** a browser that never changed the layout
- **WHEN** its participant opens the Layout tab
- **THEN** Smart Mosaic is selected

#### Scenario: Mosaic shows everyone
- **GIVEN** a meeting with seven remote participants and a Smart Mosaic limit of 4
- **WHEN** the participant selects Mosaic
- **THEN** all seven remote participants are shown
- **AND** the tiles that were already visible keep their positions

### Requirement: Visible participants in Smart Mosaic
In Smart Mosaic the participant SHALL choose how many remote participants are shown, from 1 to 6, with their own video not counted. The default SHALL be 4, and 2 on phones and tablets. The selector SHALL be disabled while Mosaic is selected.

#### Scenario: Lowering the limit
- **GIVEN** a meeting with four remote participants in Smart Mosaic
- **WHEN** the participant sets the visible participants to 2
- **THEN** two remote participants stay in the grid and the others are hidden

#### Scenario: Mosaic selected
- **GIVEN** a participant with Mosaic selected
- **WHEN** they open the Layout tab
- **THEN** the visible participants selector is disabled

#### Scenario: Phone default
- **GIVEN** a phone that never changed the layout
- **WHEN** its participant joins a meeting
- **THEN** Smart Mosaic shows at most 2 remote participants

### Requirement: Speaker priority in Smart Mosaic
Smart Mosaic SHALL fill its slots in this order: participants speaking now, those already shown first, then those who stopped less than 3 seconds ago, then earlier speakers, then participants who have not spoken. A participant SHALL become a speaker only after about 2 seconds of speech, so coughs, short bursts and quiet audio do not reshuffle the grid. A participant entering the grid SHALL take the slot of the one leaving it.

#### Scenario: A hidden participant speaks
- **GIVEN** a Smart Mosaic limit of 1 showing a silent participant, with participant B hidden
- **WHEN** B speaks continuously
- **THEN** B takes the visible slot after about 2 seconds

#### Scenario: A short sound
- **GIVEN** a Smart Mosaic limit of 1 with participant B hidden
- **WHEN** B makes a one-second sound
- **THEN** the visible participant does not change

#### Scenario: Two speakers for one slot
- **GIVEN** a Smart Mosaic limit of 1 showing participant A, who keeps speaking
- **WHEN** participant B starts speaking continuously too
- **THEN** A keeps the slot

#### Scenario: The visible speaker mutes
- **GIVEN** a Smart Mosaic limit of 1 showing speaker A while participant B also speaks
- **WHEN** A mutes their microphone
- **THEN** B takes the visible slot

### Requirement: Hidden participants indicator
While Smart Mosaic hides remote participants, the meeting SHALL show a "+N" indicator naming up to three of them. It SHALL sit in the status rail when no tile is pinned and fewer than six participants are visible, and as a tile at the bottom of the grid otherwise; activating it SHALL open the participants panel. It SHALL NOT be shown in Mosaic.

#### Scenario: Participants hidden
- **GIVEN** a Smart Mosaic limit of 1 and three remote participants
- **WHEN** the participant looks at the meeting
- **THEN** the status rail shows "+2" with the hidden participants' names
- **AND** clicking it opens the participants panel

#### Scenario: Visible participant pinned
- **GIVEN** a Smart Mosaic with hidden participants
- **WHEN** the participant pins the visible remote participant
- **THEN** the indicator moves from the status rail to a tile in the grid

### Requirement: Screen shares of hidden participants
A screen share SHALL always be shown, even when Smart Mosaic hides the camera of the participant sharing it, and SHALL NOT take one of the camera slots.

#### Scenario: Hidden participant shares
- **GIVEN** a Smart Mosaic limit of 1 with participant B hidden
- **WHEN** B shares their screen
- **THEN** B's screen share is shown and pinned
- **AND** the camera slot keeps its participant

### Requirement: Cameras the viewer does not show are not received
A viewer SHALL NOT receive the camera video of the participants Smart Mosaic hides, and SHALL receive it again as soon as they are shown, while their audio SHALL keep playing without gaps. While the meeting tab is in the background no camera video SHALL be received, and on returning only the visible ones SHALL resume. A full reconnect SHALL keep the hidden cameras paused.

#### Scenario: Participants joining beyond the limit
- **GIVEN** a Smart Mosaic limit of 1
- **WHEN** three remote participants with their cameras on join
- **THEN** the viewer receives camera video from the visible one only
- **AND** hears all three

#### Scenario: A hidden participant is shown
- **GIVEN** a hidden participant whose camera video is paused for the viewer
- **WHEN** they become visible because they speak
- **THEN** their camera video plays in their tile at once

#### Scenario: Switching to Mosaic
- **GIVEN** a viewer in Smart Mosaic with hidden participants
- **WHEN** they switch to Mosaic and back
- **THEN** they receive every camera in Mosaic and only the visible ones back in Smart Mosaic

### Requirement: Received video quality follows the tile
Each remote camera SHALL be received at the smallest quality that covers its tile on the viewer's screen. On a phone, that quality SHALL follow the tile's size without being raised for the screen's pixel density.

#### Scenario: Small tiles on a phone
- **GIVEN** a phone showing three remote cameras in small tiles
- **WHEN** the cameras publish several qualities
- **THEN** the phone receives a quality sized for its tiles, not the full capture

### Requirement: Layout preferences remembered
The layout mode and the number of visible participants SHALL be remembered per browser once the participant changes them in the settings panel, and used in later meetings; until then the defaults SHALL apply, including a default changed by a later release.

#### Scenario: Next meeting
- **GIVEN** a participant who selected Mosaic in a meeting
- **WHEN** they join another meeting in the same browser
- **THEN** Mosaic is selected

#### Scenario: Default never chosen
- **GIVEN** browser data from a desktop visit in which the participant never changed the layout
- **WHEN** the participant joins a meeting from a phone carrying that data
- **THEN** Smart Mosaic shows at most 2 remote participants, the phone default

### Requirement: Pinning
A participant SHALL be able to pin and unpin any tile, their own camera included, from the tile's controls. A pinned tile SHALL be enlarged and marked as pinned, with the other tiles in a strip beside or below it that is at most 220 px thick.

#### Scenario: Pin and unpin
- **GIVEN** a meeting with two remote participants
- **WHEN** the participant pins one of them and then unpins them
- **THEN** that tile is enlarged with the others beside it
- **AND** the grid returns to equal tiles after unpinning

### Requirement: Screen shares are pinned
A screen share that starts, the participant's own or another's, SHALL be pinned for every viewer, replacing any other pin, and a participant joining a meeting with a share in progress SHALL see it pinned. When a screen share stops, the most recent screen share still running SHALL be pinned. A screen share the viewer unpinned SHALL NOT be pinned again because someone joins.

#### Scenario: Second share
- **GIVEN** participant A sharing their screen, pinned for everyone
- **WHEN** participant B starts sharing too
- **THEN** B's share is pinned and A's is not, on both screens

#### Scenario: Share stops
- **GIVEN** participants A and B both sharing, B's share pinned
- **WHEN** B stops sharing
- **THEN** A's share is pinned again

#### Scenario: Unpinned share
- **GIVEN** a viewer who unpinned a screen share
- **WHEN** a new participant joins the meeting
- **THEN** nothing is pinned on the viewer's screen

### Requirement: Screen share zoom
A viewer SHALL be able to zoom a screen share tile from 100% to 300% in 25% steps, see the zoom percentage, pan the zoomed content and reset it, and pinch to zoom on touch devices. Zoom SHALL change only the viewer's screen, and a new screen share SHALL start unzoomed.

#### Scenario: Zooming in
- **GIVEN** a viewer hovering a screen share tile
- **WHEN** they zoom in once
- **THEN** the tile shows 125% with zoom-out and reset controls

### Requirement: Own video floats while others are present
When the first remote participant joins, or when the participant joins a meeting where others already are, their own camera SHALL float over the layout at its bottom-right corner, unless they chose to dock it in an earlier meeting. When the last remote participant leaves, it SHALL dock back into the grid, but not while the meeting is reconnecting, and a full reconnect SHALL keep it floating where it was.

#### Scenario: First remote participant joins
- **GIVEN** a participant alone in a meeting, who never docked their video
- **WHEN** another participant joins
- **THEN** their own video floats at the bottom-right corner of the layout

#### Scenario: Last remote participant leaves
- **GIVEN** a participant whose own video floats
- **WHEN** the last remote participant leaves
- **THEN** their own video is back in the grid

#### Scenario: Docked choice remembered
- **GIVEN** a participant who docked their own video in an earlier meeting in the same browser
- **WHEN** another participant joins their meeting
- **THEN** their own video stays in the grid

### Requirement: Floating or docked own video
A participant SHALL be able to float or dock their own camera from the float button of their own camera tile, offered on no other tile, and from Your video in the Layout tab; the choice SHALL be remembered per browser. While their own video is pinned the choice SHALL be disabled, and pinning a floating own video SHALL dock it first.

#### Scenario: Docking from the settings
- **GIVEN** a participant whose own video floats
- **WHEN** they choose In the grid under Your video
- **THEN** their own video becomes a tile of the grid

#### Scenario: Pinned own video
- **GIVEN** a participant who pinned their own video
- **WHEN** they open the Layout tab
- **THEN** the Your video choice is disabled with a note to unpin first

### Requirement: Moving and resizing the floating video
The floating own video SHALL be draggable anywhere in the meeting area, over the captions band included, and resizable from any of its corners keeping its aspect ratio, from 160 px wide up to 90% of the layout's width. Docking it and floating it again SHALL bring back its default size. Floating it SHALL NOT change the room the grid takes.

#### Scenario: Resizing
- **GIVEN** a floating own video
- **WHEN** the participant drags one of its corners outwards past 90% of the layout's width
- **THEN** the video grows keeping its aspect ratio and stops at 90% of the layout's width

#### Scenario: Over the captions
- **GIVEN** a participant with captions on and their own video floating
- **WHEN** they drag the video to the bottom-right corner of the meeting area
- **THEN** the video sits over the captions band

### Requirement: The floating video stays reachable
The floating own video SHALL stay entirely inside the layout when a side panel opens or closes and when the window is resized, keeping the zone it was placed in: a video at the bottom-right corner SHALL follow the new corner, and one dragged elsewhere SHALL keep its relative position.

#### Scenario: Window shrinks
- **GIVEN** a floating own video at the bottom-right corner
- **WHEN** the browser window shrinks
- **THEN** the video is at the new bottom-right corner, fully visible

#### Scenario: Panel opens
- **GIVEN** a floating own video at the right edge
- **WHEN** the participant opens the chat panel beside the grid
- **THEN** the video moves left so the panel does not cover it

### Requirement: Alone in the meeting
While the participant is the only one in the meeting, the grid SHALL show next to their video the overlay that `room-access` specifies for that moment: the invitation to share the room's speaker access link in the standalone app, or the notice that they are waiting for others in the embedded modes.

#### Scenario: Standalone app
- **GIVEN** a participant with `roomShareAccessLinks` alone in a room with a speaker access link, in the standalone app
- **WHEN** the meeting starts
- **THEN** the grid shows an invitation with that link and a copy button

#### Scenario: Embedded
- **GIVEN** a participant alone in an embedded meeting
- **WHEN** the meeting starts
- **THEN** the grid shows a waiting message and no access link

### Requirement: Status rail
A status rail SHALL sit above the layout, in a row of its own that never covers the video, whenever there is a meeting-wide status. It SHALL hold the elapsed time and forced-end countdown (see `meetings`), the recording mark (see `recordings`), the encryption mark, the raised hands count (see `raise-hand`), the reactions pulse (see `reactions`) and the hidden participants indicator. The recording mark SHALL open the activities panel; the hands, pulse and indicator, the participants panel.

#### Scenario: Recording in progress
- **GIVEN** a meeting being recorded
- **WHEN** the participant clicks the recording mark in the status rail
- **THEN** the activities panel opens on the recording

#### Scenario: Desktop countdown
- **GIVEN** a desktop meeting window and a meeting close to its maximum duration
- **WHEN** the countdown starts
- **THEN** the status rail shows the countdown next to the elapsed time

### Requirement: Status rail on phones
In a meeting 790 px wide or narrower, the status rail SHALL fit one row without any chip off screen: it SHALL keep the elapsed time, replaced by the countdown once it starts, the recording mark without its time, the raised hands count and the first two reactions of the pulse, only one at 360 px or narrower. A Meeting status button SHALL open a menu listing every status in full, the encryption mark and the hidden participants included.

#### Scenario: Encrypted meeting on a phone
- **GIVEN** an end-to-end encrypted meeting in a 360 px wide window
- **WHEN** the participant looks at the status rail
- **THEN** no chip is outside the screen and the encryption mark is not in the rail
- **AND** the Meeting status menu lists the encryption and the elapsed time

#### Scenario: Countdown on a phone
- **GIVEN** a meeting close to its maximum duration in a 360 px wide window
- **WHEN** the countdown starts
- **THEN** the rail shows the countdown instead of the elapsed time

### Requirement: Toolbar across screen sizes
In a meeting narrower than 768 px, on any device, the toolbar SHALL turn compact: every toolbar button SHALL stay within the screen, the extra buttons (such as raise hand, reactions and captions) SHALL move into the More options menu, and the panel buttons SHALL collapse into a single Panels menu.

#### Scenario: Narrow desktop window
- **GIVEN** a desktop browser window 390 px wide
- **WHEN** the participant joins a meeting
- **THEN** no toolbar button lies outside the screen
- **AND** the captions control is inside the More options menu

### Requirement: Side panels
The chat, participants, activities, settings and background effects panels SHALL open one at a time. Where the meeting is wider than 790 px a panel SHALL open beside the grid, which shrinks to make room; otherwise it SHALL open over the meeting at full width. The `<openvidu-meet>` element SHALL open panels beside the grid whatever its own width.

#### Scenario: Wide window
- **GIVEN** a meeting 1366 px wide
- **WHEN** the participant opens the chat panel
- **THEN** the panel opens beside the grid and the grid shrinks

#### Scenario: Switching panels
- **GIVEN** an open participants panel
- **WHEN** the participant opens the chat panel
- **THEN** the chat panel replaces the participants panel

### Requirement: Settings panel tabs
The settings panel SHALL group its options in an Audio & video tab, shown only to participants allowed to publish their camera or microphone (see `meeting-media`), a Layout tab and a General tab, and SHALL open on the tab its caller asks for or on the first one.

#### Scenario: Opening the layout settings
- **GIVEN** a participant in the meeting
- **WHEN** they choose More options > Adjust layout
- **THEN** the settings panel opens on the Layout tab

### Requirement: Notifications placement
Announcements about the meeting as a whole (such as a recording starting or stopping and the meeting ending soon) SHALL stack under the status rail on the left, and every other notice SHALL stack in the top-right corner under the status rail, beside an open side panel or below its header when the panel covers the meeting. Neither stack SHALL take height from the layout. In a meeting 790 px wide or narrower, both stacks SHALL span the screen's width.

#### Scenario: Notice with a panel open
- **GIVEN** a desktop meeting with the chat panel open beside the grid
- **WHEN** a chat message notice appears
- **THEN** it sits left of the panel and leaves the panel's header and close button uncovered

### Requirement: Fullscreen
More options > Fullscreen and the F11 key SHALL toggle the meeting into and out of fullscreen, and menus, dialogs and notifications SHALL stay visible while in fullscreen.

#### Scenario: Menu in fullscreen
- **GIVEN** a meeting in fullscreen
- **WHEN** the participant opens the More options menu
- **THEN** the menu is visible and offers to exit fullscreen

### Requirement: Phones in landscape
A phone held in landscape SHALL show a message asking to rotate the device to portrait, on the device setup screen instead of it and over the live meeting.

#### Scenario: Rotating a phone
- **GIVEN** a participant on a phone in a meeting
- **WHEN** they rotate the phone to landscape
- **THEN** a message asks them to rotate the device to portrait
