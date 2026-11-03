## ADDED Requirements

### Requirement: The device setup screen stays within the element
The device setup screen of the embedded element SHALL be drawn and receive pointer events only inside the element's box, so the host page outside that box stays visible and clickable.

#### Scenario: Host header while the setup screen is shown
- **GIVEN** an element smaller than the viewport on a host page with a header above it
- **WHEN** the element shows the device setup screen
- **THEN** a click on the host's header reaches the header, not the element
