## MODIFIED Requirements

### Requirement: One queue for everyone
Raised hands SHALL form a single queue ordered by `handRaiseDate`, earliest first, with ties broken by participant identity, identical on every participant's screen. `handRaiseDate` SHALL be read from one clock shared by every Meet replica, so the queue follows the order in which the server took the raises, whichever replica served each one. The REST snapshots of `participantList` and `participantGet` SHALL report each participant's `handRaised` and, while it is up, `handRaiseDate`.

#### Scenario: Queue order
- **GIVEN** Ana raised her hand before Ben
- **WHEN** any participant looks at the queue
- **THEN** Ana is first and Ben second
- **AND** when Ana lowers her hand, Ben becomes first on every screen

#### Scenario: Raises served by replicas with different clocks
- **GIVEN** two Meet replicas sharing Redis, the clock of the second one 2 seconds ahead of the first
- **WHEN** Ana raises her hand through the first replica and Ben, 1 second later, through the second
- **THEN** Ana is first and Ben second on every screen
- **AND** Ana's `handRaiseDate` is earlier than Ben's
