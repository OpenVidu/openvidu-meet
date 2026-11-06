# Console Specification

## Purpose

The console is the part of the Meet app where registered users land after logging in: a shell whose navigation adapts to the user role, an overview of usage for administrators, and the embedded page that gathers what an integrator needs. Admins, room managers and room members rely on it to reach every management page.

Surfaces: the console at `<base path>/` (shell, `overview` and `embedded` pages), the internal REST API `getAnalytics` (`meet-ce/backend/openapi/analytics/`). The pages of each domain (rooms, recordings, users, configuration) belong to that domain's capability; the login page and the session (how a visitor without one is sent to log in and back) to `authentication`, and the forced password change page to `users`. Documented in openvidu.io `docs/meet/features/users/overview.md` (what each user role can do) and `docs/meet/embedded/reference/rest-api.md`.

## Requirements

### Requirement: Console at the root of the app
The console SHALL be served at the root of the app (`<base path>/`). An app path that matches no page SHALL redirect to the console, and a console path that matches no page SHALL redirect to the overview.

#### Scenario: Unknown console path
- **GIVEN** a logged-in admin
- **WHEN** they open `<base path>/does-not-exist`
- **THEN** the overview is shown

### Requirement: Navigation by user role
The console navigation SHALL list, in this order, the pages the user role reaches: Overview, Rooms, Recordings, Users, Embedded and Configuration for `admin`; Rooms and Recordings for `room_manager` and `room_member`.

#### Scenario: Admin navigation
- **GIVEN** a logged-in user with role `admin`
- **WHEN** the console opens
- **THEN** the navigation lists Overview, Rooms, Recordings, Users, Embedded and Configuration

#### Scenario: Room manager navigation
- **GIVEN** a logged-in user with role `room_manager`
- **WHEN** the console opens
- **THEN** the navigation lists Rooms and Recordings only

#### Scenario: Room member navigation
- **GIVEN** a logged-in user with role `room_member`
- **WHEN** the console opens
- **THEN** the navigation lists Rooms and Recordings only

### Requirement: Landing page by user role
Opening the console root SHALL show the overview to an `admin` and the rooms page to a `room_manager` or `room_member`.

#### Scenario: Room member lands on rooms
- **GIVEN** a logged-in user with role `room_member`
- **WHEN** they open `<base path>/`
- **THEN** the rooms page is shown

### Requirement: Admin-only pages
The console SHALL redirect a user whose role is not `admin` to the rooms page when they open the overview, the embedded page or the configuration page, even by typing its address.

#### Scenario: Room manager types the embedded page address
- **GIVEN** a logged-in user with role `room_manager`
- **WHEN** they open `<base path>/embedded`
- **THEN** the rooms page is shown

### Requirement: Console toolbar
The console toolbar SHALL offer, on every console page, the language selector (see `localization`), the light and dark theme switch, a profile button opening the user's profile page (see `users`) and a logout button (see `authentication`).

#### Scenario: Profile from any page
- **GIVEN** a logged-in user on the recordings page
- **WHEN** they press the profile button
- **THEN** their profile page is shown inside the console

### Requirement: Light and dark theme
The console SHALL start in the theme the user last chose in this browser, or else in the operating system's preference, or else light. Switching the theme SHALL be remembered in the browser, and it is the same preference the meeting's theme selector uses. While no choice is stored, the console SHALL follow changes of the operating system's preference.

#### Scenario: Choice remembered
- **GIVEN** a user switches the console to dark
- **WHEN** they reload the console
- **THEN** the console is dark

#### Scenario: Following the system
- **GIVEN** a browser with no stored theme choice and a light operating system preference
- **WHEN** the operating system switches to dark
- **THEN** the console switches to dark

### Requirement: Collapsible navigation with version
The navigation SHALL collapse to icons, each showing its label as a tooltip, and expand again from the menu button. Expanded, it SHALL show the Meet version and edition.

#### Scenario: Collapsed navigation
- **GIVEN** an expanded navigation
- **WHEN** the user presses the menu button
- **THEN** only the page icons remain, with their labels as tooltips

### Requirement: Overview with usage figures
The overview SHALL show, from `getAnalytics`, the number of rooms split into open, in a meeting now and closed, and the number of recordings split into available for playback, in progress now and failed, each split as a proportional bar with a legend carrying the counts, with actions to create a room, list all rooms and list all recordings.

#### Scenario: Deployment in use
- **GIVEN** three rooms, one open, one with an active meeting and one closed, and two complete recordings, one recording in progress and one that failed
- **WHEN** an admin opens the overview
- **THEN** it shows 3 rooms with 1 open, 1 in a meeting now and 1 closed
- **AND** it shows 4 recordings with 2 available for playback, 1 in progress and 1 failed

#### Scenario: Nothing running
- **GIVEN** rooms and recordings, none of them in a meeting or in progress
- **WHEN** an admin opens the overview
- **THEN** it shows 0 recordings in progress and 0 rooms in a meeting now

#### Scenario: Bar without a status
- **GIVEN** three complete recordings and none in progress or failed
- **WHEN** an admin opens the overview
- **THEN** the recordings bar is filled by the available segment alone
- **AND** the legend still lists in progress and failed with 0

### Requirement: Overview getting started
When the figures read from the server show no room and no recording, the overview SHALL show a getting-started view with three actions: create the first room, go to the configuration page and go to the embedded page. A request that failed SHALL never produce this view.

#### Scenario: Fresh deployment
- **GIVEN** a deployment with no rooms and no recordings
- **WHEN** an admin opens the overview
- **THEN** the getting-started view is shown
- **AND** its actions open the room wizard, the configuration page and the embedded page

#### Scenario: First request fails
- **GIVEN** a deployment with rooms and recordings and a server that fails the first request of the overview
- **WHEN** an admin opens the overview
- **THEN** an error notice says the figures could not be read, with the Refresh action
- **AND** the getting-started view is not shown

### Requirement: Usage analytics endpoint
`getAnalytics` (`GET /internal-api/v1/analytics`) SHALL answer only an access token of a user with role `admin`. A user with another role SHALL get `403`; an API key or no credential SHALL get `401`.

#### Scenario: Admin reads analytics
- **WHEN** an admin calls `getAnalytics` with their access token
- **THEN** the server answers `200` with `totalRooms`, `activeRooms`, `openRooms`, `closedRooms`, `totalRecordings`, `completeRecordings`, `recordingsInProgress`, `failedRecordings` and `roomsExpiringSoon`, and with `nextExpiringRoom` when a room is expiring soon

#### Scenario: API key is not accepted
- **WHEN** a client calls `getAnalytics` with the API key
- **THEN** the server answers `401`

#### Scenario: Room manager is refused
- **WHEN** a `room_manager` calls `getAnalytics`
- **THEN** the server answers `403`

### Requirement: Analytics count the current state
`getAnalytics` SHALL count the rooms that exist (`totalRooms`) and, of them, those open (`openRooms`), with an active meeting (`activeRooms`) and closed (`closedRooms`); and the recordings that exist (`totalRecordings`) and, of them, those `complete` (`completeRecordings`), those `starting`, `active` or `ending` (`recordingsInProgress`) and those `failed`, `aborted` or `limit_reached` (`failedRecordings`). Deleted rooms and recordings SHALL not be counted.

#### Scenario: Room deleted
- **GIVEN** `getAnalytics` reports 3 rooms
- **WHEN** one room is deleted
- **THEN** `getAnalytics` reports 2 rooms

#### Scenario: Recording still in progress
- **GIVEN** one complete recording and one recording that is still active
- **WHEN** an admin calls `getAnalytics`
- **THEN** `totalRecordings` is 2, `completeRecordings` is 1, `recordingsInProgress` is 1 and `failedRecordings` is 0

#### Scenario: Rooms by status
- **GIVEN** one open room, one room with an active meeting and two closed rooms
- **WHEN** an admin calls `getAnalytics`
- **THEN** `totalRooms` is 4, `openRooms` is 1, `activeRooms` is 1 and `closedRooms` is 2

#### Scenario: Recording that is not in progress
- **GIVEN** a recording that is `complete`, one that `failed`, one that was `aborted` and one whose status is `limit_reached`
- **WHEN** an admin calls `getAnalytics`
- **THEN** `recordingsInProgress` is 0 and `failedRecordings` is 3
- **AND** `completeRecordings`, `recordingsInProgress` and `failedRecordings` add up to `totalRecordings`

### Requirement: Embedded page
The embedded page SHALL gather, for administrators, the API key section (see `authentication`) and the webhooks section (see `webhooks`), and SHALL link to the REST API reference served by the deployment at `<base path>/api/v1/docs/`.

#### Scenario: Link follows the base path
- **GIVEN** `MEET_BASE_PATH=/video`
- **WHEN** an admin opens the embedded page
- **THEN** its REST API reference link points to `/video/api/v1/docs/`

### Requirement: Domain pages in the console
The console SHALL host the pages of the other capabilities inside its shell: rooms (`rooms`, `room-members`), recordings (`recordings`), users and profile (`users`) and configuration (`appearance`), each with its own access rules.

#### Scenario: Room page keeps the console shell
- **GIVEN** a logged-in room manager
- **WHEN** they open one of their rooms from the rooms page
- **THEN** the room detail page is shown with the console navigation and toolbar

### Requirement: Console lists open an item from its row
On the console lists of rooms, recordings and users, clicking a row SHALL open the detail page of its item, except when the click ends a text selection or lands on a link, a button or a selection checkbox; a click with Ctrl or Cmd SHALL open it in a new tab. The ids of rooms and users SHALL be links to their pages, and on the recordings list the room id SHALL link to the room.

#### Scenario: Clicking a row opens its item
- **GIVEN** a console list of recordings
- **WHEN** the user clicks a row outside its buttons and links
- **THEN** the recording detail page opens

#### Scenario: Selecting text does not open the item
- **GIVEN** a console list of rooms
- **WHEN** the user selects the text of a room name by dragging over it
- **THEN** the room detail page does not open
- **AND** the selected text stays selected

#### Scenario: Opening an item in a new tab
- **GIVEN** a console list of users
- **WHEN** the user clicks a row with Ctrl or Cmd held
- **THEN** the user's page opens in a new tab and the list stays as it is

#### Scenario: Room link on the recordings list
- **GIVEN** a `room_member` user lists recordings
- **WHEN** they click the room id of a recording
- **THEN** the room detail page opens, because the list holds only recordings of rooms the user owns, is a member of or that have user access enabled
- **AND** on the Users list the signed-in user's own id opens their profile

### Requirement: Console lists keep their search and filters in the URL
On the console lists of rooms, users and recordings, the search text, its match mode, the filters and the sort field and order SHALL be kept in the URL query string, so that opening, reloading or sharing the URL shows the same list and the browser's back and forward buttons step through the searches. A value the list does not accept SHALL be ignored, and a list opened without a query string SHALL show the default list.

#### Scenario: Searching changes the URL
- **GIVEN** the console Rooms list
- **WHEN** the user filters by status and sorts by name
- **THEN** the URL carries the status and the sort
- **AND** reloading the page shows the same filtered, sorted list

#### Scenario: Going back after opening an item
- **GIVEN** a filtered list of recordings
- **WHEN** the user opens a recording and then goes back
- **THEN** the list is filtered as before and shows the current data

#### Scenario: Unknown value in the URL
- **GIVEN** a URL of the Users list with a sort field the list does not offer
- **WHEN** the page opens
- **THEN** the list is sorted by its default field

### Requirement: Room detail keeps its tab in the URL
The console room detail page SHALL keep the selected tab (recordings or room members) in the URL query string, so that a reload or a return from another page opens the same tab.

#### Scenario: Returning to the members tab
- **GIVEN** a room manager on the Room Members tab of a room
- **WHEN** they open a member's edit page and go back
- **THEN** the Room Members tab is selected

### Requirement: Console lists keep their rows while they reload
A console list that reloads, because of a search, a sort, a refresh or loading more rows, SHALL keep the rows it shows, dimmed and not clickable, until the new rows arrive, and SHALL show placeholder rows instead of a spinner when it has no rows to keep.

#### Scenario: Searching keeps the rows on screen
- **GIVEN** a console list showing rooms
- **WHEN** the user changes a filter and the server takes a while to answer
- **THEN** the rooms stay on screen, dimmed, until the new list replaces them

#### Scenario: First rows of a list
- **GIVEN** a console list with no rows, after a search found nothing
- **WHEN** the user clears the search and the server takes a while to answer
- **THEN** placeholder rows are shown until the rooms arrive

### Requirement: Console Embedded page keeps its layout while it loads
The console Embedded page SHALL show its API key and webhooks sections from the start, with placeholder rows in place of their content until it loads, and SHALL NOT replace the page with a loading message.

#### Scenario: Opening the Embedded page
- **GIVEN** a logged-in administrator
- **WHEN** they open the Embedded page and the server takes a while to answer
- **THEN** the page title and both sections are shown with placeholder rows
- **AND** the placeholders are replaced by the API key and the webhooks when they arrive

### Requirement: Overview shows the rooms expiring soon
The overview SHALL show how many rooms reach their `autoDeletionDate` within the next 7 days and, for the one that reaches it first, its name linking to its detail page, or a message that no room is scheduled when none does.

#### Scenario: Rooms expiring
- **GIVEN** three rooms with an `autoDeletionDate` within the next 7 days, the earliest in two days
- **WHEN** an admin opens the overview
- **THEN** it shows 3 rooms expiring soon and the name of the room that expires in two days
- **AND** opening that name shows the room's detail page

#### Scenario: No room expiring
- **GIVEN** rooms with no `autoDeletionDate`, or with one more than 7 days ahead
- **WHEN** an admin opens the overview
- **THEN** it shows 0 rooms expiring soon and that no room is scheduled for automatic deletion

### Requirement: Analytics report the rooms about to expire
`getAnalytics` SHALL report in `roomsExpiringSoon` the rooms whose `autoDeletionDate` falls between now and 7 days ahead, and in `nextExpiringRoom` the `roomId`, `roomName` and `autoDeletionDate` of the one with the earliest date, leaving it out when there is none. Rooms without a date, with a later one, or with a date already passed SHALL not be counted.

#### Scenario: Rooms within the window
- **GIVEN** a room expiring in two days, a room expiring in six days and a room expiring in ten days
- **WHEN** an admin calls `getAnalytics`
- **THEN** `roomsExpiringSoon` is 2 and `nextExpiringRoom` is the room expiring in two days

#### Scenario: Date already passed
- **GIVEN** a closed room with recordings whose `autoDeletionDate` passed yesterday, kept by the default policy
- **WHEN** an admin calls `getAnalytics`
- **THEN** `roomsExpiringSoon` is 0 and `nextExpiringRoom` is absent

### Requirement: Overview keeps its figures current
While the overview is open and its tab is visible, it SHALL request the figures every 30 seconds and again as soon as the tab becomes visible after being hidden, and SHALL not request them while the tab is hidden. It SHALL offer a Refresh action that requests them at once, show the time of the last successful reading, and keep the figures on screen while a request runs. When a request fails it SHALL keep the last figures and show an error notice.

#### Scenario: Periodic refresh
- **GIVEN** the overview is open in a visible tab and a recording starts
- **WHEN** 30 seconds pass
- **THEN** the overview requests the figures again and shows one recording in progress
- **AND** the time of the last reading is updated

#### Scenario: Hidden tab
- **GIVEN** the overview is open in a tab that is then hidden for several minutes
- **WHEN** the tab becomes visible again
- **THEN** the overview requests the figures at once
- **AND** it made no request while the tab was hidden

#### Scenario: Manual refresh
- **WHEN** an admin chooses Refresh on the overview
- **THEN** the overview requests the figures at once and shows the time of that reading

#### Scenario: Figures stay while reloading
- **GIVEN** the overview shows its figures
- **WHEN** it requests them again
- **THEN** the figures stay on screen and no loading screen replaces them

#### Scenario: Failed reload
- **GIVEN** the overview shows its figures
- **WHEN** a later request fails
- **THEN** the last figures and the time of the last successful reading stay on screen
- **AND** an error notice says the figures could not be updated
- **AND** the next refresh requests them again
