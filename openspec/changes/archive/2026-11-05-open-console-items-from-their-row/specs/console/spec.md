## ADDED Requirements

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
