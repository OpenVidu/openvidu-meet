## MODIFIED Requirements

### Requirement: Secret and encryption key are kept out of the address bar
In the standalone app and the iframe the meeting SHALL remove `secret` and `e2ee-key` from the address bar once the room is entered, and SHALL keep both for the browser tab together with their room, so reloading the same room enters it again with the same access and key. An entry to another room without `secret` or `e2ee-key`, in the same tab or in the same embedded element, SHALL NOT use them.

#### Scenario: Reload after entering
- **GIVEN** a participant who opened `/room/{roomId}?secret=<speaker secret>`
- **WHEN** the room is entered
- **THEN** the address bar shows `/room/{roomId}` without `secret`
- **AND** reloading the page shows the join screen of the same room with the same access

#### Scenario: Another room in the same tab
- **GIVEN** a tab that entered room A through its anonymous speaker link, with no Meet session
- **WHEN** the same tab opens room B's user access link, which carries no `secret`
- **THEN** the login screen is shown, not the "Invalid link" error screen

#### Scenario: Element switched to another room
- **GIVEN** an `<openvidu-meet>` on room A's join screen, entered through room A's anonymous speaker link, with no Meet session
- **WHEN** the host sets `room-url` to room B's user access link, which carries no `secret`
- **THEN** the element shows the login screen, not the "Invalid link" error screen
