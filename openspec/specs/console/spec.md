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
The overview SHALL show, from `getAnalytics`, the number of rooms with how many hold an active meeting, and the number of recordings with how many are available for playback, with actions to create a room, list all rooms and list all recordings.

#### Scenario: Deployment in use
- **GIVEN** three rooms, one with an active meeting, and two complete recordings
- **WHEN** an admin opens the overview
- **THEN** it shows 3 rooms with 1 active meeting and 2 recordings with 2 available for playback

### Requirement: Overview getting started
When the deployment has no room and no recording, the overview SHALL show a getting-started view with three actions: create the first room, go to the configuration page and go to the embedded page.

#### Scenario: Fresh deployment
- **GIVEN** a deployment with no rooms and no recordings
- **WHEN** an admin opens the overview
- **THEN** the getting-started view is shown
- **AND** its actions open the room wizard, the configuration page and the embedded page

### Requirement: Usage analytics endpoint
`getAnalytics` (`GET /internal-api/v1/analytics`) SHALL answer only an access token of a user with role `admin`. A user with another role SHALL get `403`; an API key or no credential SHALL get `401`.

#### Scenario: Admin reads analytics
- **WHEN** an admin calls `getAnalytics` with their access token
- **THEN** the server answers `200` with `totalRooms`, `activeRooms`, `totalRecordings` and `completeRecordings`

#### Scenario: API key is not accepted
- **WHEN** a client calls `getAnalytics` with the API key
- **THEN** the server answers `401`

#### Scenario: Room manager is refused
- **WHEN** a `room_manager` calls `getAnalytics`
- **THEN** the server answers `403`

### Requirement: Analytics count the current state
`getAnalytics` SHALL count the rooms that exist (`totalRooms`), those whose meeting is active (`activeRooms`), the recordings that exist (`totalRecordings`) and those whose status is `complete` (`completeRecordings`). Deleted rooms and recordings SHALL not be counted.

#### Scenario: Room deleted
- **GIVEN** `getAnalytics` reports 3 rooms
- **WHEN** one room is deleted
- **THEN** `getAnalytics` reports 2 rooms

#### Scenario: Recording still in progress
- **GIVEN** one complete recording and one recording that is still active
- **WHEN** an admin calls `getAnalytics`
- **THEN** `totalRecordings` is 2 and `completeRecordings` is 1

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
