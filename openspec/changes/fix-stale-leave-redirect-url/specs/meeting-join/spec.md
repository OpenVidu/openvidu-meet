## ADDED Requirements

### Requirement: A leave redirect belongs to its room entry
The leave redirect SHALL apply only to the entry that set it. An entry without `leave-redirect-url` SHALL have no leave redirect, even when an earlier entry on the same page, element or browser tab had one, and the redirect kept across reloads SHALL apply only to the room it was set for.

#### Scenario: New element on another room without a redirect
- **GIVEN** an element on room A with `leave-redirect-url="https://app.example.com/a"` that was removed
- **WHEN** the host adds a new element on room B without `leave-redirect-url` and the participant presses Back on the join screen
- **THEN** the host page stays where it is

#### Scenario: Iframe replaced by another one
- **GIVEN** an iframe on room A whose `src` carries a `leave-redirect-url`, replaced by an iframe on room B without it
- **WHEN** the participant of the second iframe presses Back
- **THEN** the host page is not navigated

#### Scenario: Reload of the same room
- **GIVEN** a direct link to room A with a `leave-redirect-url`
- **WHEN** the tab is reloaded and the participant dismisses the end screen
- **THEN** the page navigates to the redirect
