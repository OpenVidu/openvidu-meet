## ADDED Requirements

### Requirement: The server limits reactions per participant
The reactions endpoint SHALL accept at most 2 reactions per second from each participant of a meeting, counted across every Meet replica, and answer `429` to the rest, as other rate-limited requests are answered (see `deployment`). Reactions SHALL NOT count toward the per-address API limit, and a participant over this limit SHALL keep every other request, as SHALL the other participants behind the same address. No limit SHALL apply when `NODE_ENV` is `development`, `test` or `ci`.

#### Scenario: Flood from a modified client
- **GIVEN** a participant in a meeting holding `participantReactionSend`
- **WHEN** their client sends 10 reactions within one second
- **THEN** 2 of them are relayed and the others are answered `429`
- **AND** a hand raise the participant sends right after answers 200

#### Scenario: Participants behind one address
- **GIVEN** ten participants of a meeting behind one public address, each reacting once per second for a minute
- **WHEN** one of them raises their hand and another one reads the room
- **THEN** every reaction is relayed and both requests succeed

#### Scenario: Reactions spread over two replicas
- **GIVEN** two Meet replicas behind a load balancer sharing Redis
- **WHEN** a participant sends 4 reactions within one second, 2 to each replica
- **THEN** 2 are relayed and the other 2 are answered `429`
