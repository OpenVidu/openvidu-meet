## ADDED Requirements

### Requirement: The host page's root element is left untouched
The embedded element SHALL NOT add, change or remove any attribute, class or inline style of the host page's `<html>` or `<body>`, when it connects, when the system color scheme changes, or after it is removed. The element's theme SHALL apply inside the element only.

#### Scenario: Host theme attribute in light mode
- **GIVEN** a host page whose `<html>` has `data-theme="cupcake"` and a light system theme
- **WHEN** an element connects and shows the join screen
- **THEN** the host `<html>` still has `data-theme="cupcake"` and no attribute or inline style added by Meet

#### Scenario: System switches to dark
- **GIVEN** a connected element on the same page
- **WHEN** the operating system switches to the dark color scheme
- **THEN** the host `<html>` is unchanged
- **AND** after the element is removed the host `<html>` is still unchanged
