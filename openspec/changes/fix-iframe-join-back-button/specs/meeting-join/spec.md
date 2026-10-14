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
