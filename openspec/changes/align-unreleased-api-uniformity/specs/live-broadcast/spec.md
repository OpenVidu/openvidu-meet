## MODIFIED Requirements

### Requirement: Room destinations of a start request
A start request SHALL name the room destinations to stream to by their ids in `destinationIds`, each streamed to as saved. The server SHALL keep an omitted `destinationIds` apart from an empty one: omitted, it SHALL stream to every room destination not streamed to yet; empty, to none of them. It SHALL answer `422` to an id the room does not have, as a config request does.

#### Scenario: Only some room destinations
- **GIVEN** a room with destinations A and B and a meeting in progress
- **WHEN** `broadcastStart` is called with `destinationIds` holding only A
- **THEN** the REST API answers `201` with one broadcast, to A

#### Scenario: Only a destination for the meeting
- **GIVEN** a room with destinations A and B and a meeting in progress
- **WHEN** `broadcastStart` is called with an empty `destinationIds` and one destination in `destinations`
- **THEN** the REST API answers `201` with one broadcast, to that destination, and none to A or B

#### Scenario: Room destinations and one for the meeting
- **GIVEN** a room with destinations A and B and a meeting in progress
- **WHEN** `broadcastStart` is called without `destinationIds` and with one destination in `destinations`
- **THEN** the REST API answers `201` with three broadcasts: A, B and that destination

#### Scenario: Id of another room
- **WHEN** `broadcastStart` is called with a `destinationIds` entry the room does not have, such as the id of another room's destination
- **THEN** the REST API answers `422` and no broadcast starts

## ADDED Requirements

### Requirement: Broadcast conflicts carry a code
`broadcastStart` and `broadcastStop` SHALL answer each `409` with a snake_case code in `error` that tells its cause apart: `destination_in_use`, `already_broadcasting`, `no_participants` or `broadcast_busy` for a start, and `broadcast_ending` or `broadcast_busy` for a stop. The other refusals of the broadcast operations SHALL keep the error `Broadcast Error`.

#### Scenario: Start in a meeting without participants
- **GIVEN** a room with live broadcast enabled whose meeting has no participants
- **WHEN** `broadcastStart` is called for it
- **THEN** the REST API answers `409` with error `no_participants`

#### Scenario: Stop of a broadcast being stopped
- **GIVEN** a broadcast still `ending` after a stop
- **WHEN** `broadcastStop` is called for it again
- **THEN** the REST API answers `409` with error `broadcast_ending`
