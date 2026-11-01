## ADDED Requirements

### Requirement: The host page's own nodes stay in the host page
The embedded element SHALL NOT move, remove or replace any node that the host page created, including the accessibility containers of a host that uses Angular CDK or Material. The host's `aria-describedby` references and live announcements SHALL keep working while the element is connected and after it is removed.

#### Scenario: Host with its own live region
- **GIVEN** a host page that added its own live announcer and tooltip description container to `<body>`
- **WHEN** an element connects, joins a meeting and is later removed
- **THEN** both host nodes are still children of `<body>`
- **AND** the host's announcements and `aria-describedby` references still resolve
