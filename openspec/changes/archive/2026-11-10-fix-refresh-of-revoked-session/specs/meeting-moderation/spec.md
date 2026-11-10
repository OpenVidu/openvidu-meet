## MODIFIED Requirements

### Requirement: A kick ends the kicked participant's tokens
Kicking a participant SHALL make every room member token issued to them until then stop connecting: a reconnection with one SHALL be removed at once, without any `participantJoined` or `participantLeft` webhook. Presenting one as the previous token SHALL NOT renew the kicked session, even while it is still connected, and the token request SHALL answer `401`. They SHALL come back by obtaining a new token through their link.

#### Scenario: Reconnecting with the old token
- **GIVEN** a speaker kicked from a meeting
- **WHEN** they connect to the meeting's media again with the token they held
- **THEN** they are removed at once
- **AND** no `participantJoined` or `participantLeft` webhook is sent for that connection

#### Scenario: Renewing the old token before the removal
- **GIVEN** a speaker kicked from a meeting who reconnects with the token they held
- **WHEN** their client asks for a fresh token with that token as the previous one, before Meet removes the reconnection
- **THEN** the server answers `401` and the reconnection is removed

#### Scenario: Next meeting with the old token
- **GIVEN** a speaker kicked from a meeting that has since ended
- **WHEN** they connect to the room's next meeting with the token they held
- **THEN** they are removed at once

#### Scenario: Coming back through the link
- **GIVEN** a speaker kicked from a meeting
- **WHEN** they open their link again and join
- **THEN** they enter the meeting
