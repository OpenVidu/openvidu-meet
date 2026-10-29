## ADDED Requirements

### Requirement: Styles stay on their side of the element
The embedded element SHALL apply Meet's styles only inside its shadow root and SHALL NOT take in the host page's stylesheets, so no rule of Meet applies to the host page and no rule of the host page applies inside Meet. Only what CSS lets cross a shadow root by design SHALL cross it: inherited properties and custom properties set on the element, and its shadow parts.

#### Scenario: Host page rule
- **GIVEN** a host page whose `<head>` holds `<style>button { background: red; }</style>`
- **WHEN** the element shows the join screen
- **THEN** the join screen's buttons do not have a red background

#### Scenario: Meet's rules do not reach the host page
- **GIVEN** a host page with its own element of class `mat-mdc-button`
- **WHEN** an element joins a meeting and the participant opens a menu of the meeting
- **THEN** the computed style of the host page's element is the same as before the element was connected
- **AND** no stylesheet Meet adds to the host document's `<head>` declares any style, other than the font stylesheets

