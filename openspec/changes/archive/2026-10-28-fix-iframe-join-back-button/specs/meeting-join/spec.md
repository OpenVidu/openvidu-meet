## MODIFIED Requirements

### Requirement: Back button on the join screen
The join screen SHALL offer a back button: always in the embedded element and the iframe, and in the standalone app when a leave redirect is set or the participant is signed in. In the standalone app a signed-in participant without a leave redirect goes back to the console rooms page. In the embedded element and the iframe the button reads `Back` and emits `embeddedCloseRequested`, then follows the leave redirect when one is set.

#### Scenario: Anonymous direct link
- **GIVEN** an anonymous participant opening a direct link without `leave-redirect-url`
- **WHEN** the join screen is shown
- **THEN** it has no back button

#### Scenario: Embedded element without a redirect
- **GIVEN** an embedded element without `leave-redirect-url`
- **WHEN** the participant presses back on the join screen
- **THEN** the host receives `embeddedCloseRequested` and the element stays where it is

#### Scenario: Signed-in user in an iframe without a redirect
- **GIVEN** a signed-in user on the join screen of an iframe without `leave-redirect-url`
- **WHEN** the join screen is shown
- **THEN** its back button reads `Back`, not `Back to Rooms`
- **AND** pressing it posts `embeddedCloseRequested` to the containing page and the iframe stays where it is

#### Scenario: Anonymous participant in an iframe
- **GIVEN** an anonymous participant on the join screen of an iframe without `leave-redirect-url`
- **WHEN** the join screen is shown
- **THEN** it offers a back button reading `Back`

### Requirement: Dismissing the end and error screens
The end screen and the access error screens SHALL offer a dismiss button where it leads somewhere: always in the embedded element and the iframe; when a leave redirect is set, in every mode; and in the standalone app for a signed-in user, leading to the console (`Back to Rooms` on the end screen, `Back to Console` on an error screen). Otherwise no button is shown.

#### Scenario: Anonymous participant in the standalone app
- **GIVEN** an anonymous participant who opened a direct link without `leave-redirect-url`
- **WHEN** they leave the meeting
- **THEN** the end screen shows no dismiss button

#### Scenario: Signed-in user in the standalone app
- **GIVEN** a signed-in user in a meeting opened from the console
- **WHEN** they leave and press `Back to Rooms`
- **THEN** the console rooms page is shown

#### Scenario: Error screen in the iframe
- **GIVEN** an iframe without `leave-redirect-url` showing an access error screen
- **WHEN** the participant presses its dismiss button
- **THEN** the containing page receives `embeddedCloseRequested` and the iframe stays where it is
