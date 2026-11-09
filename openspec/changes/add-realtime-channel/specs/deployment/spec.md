## ADDED Requirements

### Requirement: Realtime connections reach a participant on any replica
Meet SHALL accept realtime connections (WebSocket) at `<base path>/internal-api/v1/realtime` on its HTTP port, each belonging to the room and participant identity of the token that opened it (see `authentication`). Every message the server addresses to a participant SHALL reach each open realtime connection of that participant, whichever replica holds the connection and whichever produced the message, in the order each replica produced them.

#### Scenario: Message produced on another replica
- **GIVEN** two Meet replicas sharing Redis and a participant whose realtime connection is held by replica A
- **WHEN** replica B produces a message for that participant
- **THEN** the participant's connection receives it

#### Scenario: Two connections of one participant
- **GIVEN** a participant with two open realtime connections, held by different replicas
- **WHEN** the server produces a message for that participant
- **THEN** both connections receive it

### Requirement: Realtime connections carry only the server's messages to their participant
A realtime connection SHALL NOT receive messages addressed to another participant or another room, and the server SHALL ignore whatever a client sends on it.

#### Scenario: Another participant of the same room
- **GIVEN** two participants of the same room, each with a realtime connection
- **WHEN** the server produces a message for the first one
- **THEN** the second one's connection receives nothing

#### Scenario: Client sends a message
- **WHEN** a client sends a message on its realtime connection
- **THEN** the server ignores it and the connection stays open

### Requirement: Realtime connections are kept alive
Meet SHALL ping each realtime connection every 20 seconds and close a connection that has not answered by the next ping. In the same cycle it SHALL send a heartbeat message to each connection that received no other message, so the meeting client can tell a dead connection from a quiet one.

#### Scenario: Idle connection behind a load balancer
- **GIVEN** a realtime connection on which no feature sends any message for ten minutes
- **WHEN** the connection crosses a load balancer that drops connections idle for 60 seconds
- **THEN** the connection stays open

#### Scenario: Unanswered pings
- **GIVEN** a client that stops answering pings without closing its connection
- **WHEN** the next ping comes due without an answer
- **THEN** the server closes the connection

### Requirement: Realtime connections are resumed
The meeting client SHALL reconnect after losing a connection it did not close, or after 50 seconds without receiving anything, with growing, randomly spread delays. When the network comes back or the page becomes visible again after a silence, it SHALL reconnect at once. Every feature using the channel SHALL send its current state to a connection when it opens, so a client never depends on a message it missed.

#### Scenario: Dead connection the browser keeps open
- **GIVEN** a meeting client whose network path to Meet dies without the browser closing the connection
- **WHEN** nothing reaches the client for 50 seconds
- **THEN** the client reconnects and receives the current state of the features that use the channel

#### Scenario: Replica stops
- **GIVEN** two replicas behind a load balancer and a meeting client whose realtime connection is held by replica A
- **WHEN** replica A stops
- **THEN** the client reconnects through replica B
- **AND** it receives the current state of the features that use the channel

### Requirement: Realtime connections of a replica that loses its Redis subscription
A replica whose Redis subscription is down SHALL close new realtime connections at once, asking the client to try again later, and SHALL keep its open connections. When the subscription is back, it SHALL send the current state of every feature to each of its connections, so no client depends on a message published while the replica could not receive it.

#### Scenario: Redis outage on one replica
- **GIVEN** two replicas and a client connected through replica A
- **WHEN** replica A's Redis subscription drops while replica B produces a message for the client, and then comes back
- **THEN** the client's connection stays open
- **AND** once the subscription is back, the client receives the current state, which reflects the message it missed

#### Scenario: Connecting while the subscription is down
- **GIVEN** a replica whose Redis subscription is down
- **WHEN** a client opens a realtime connection through it
- **THEN** the connection is closed, asking the client to try again later, and the client retries
