## MODIFIED Requirements

### Requirement: Delivery never holds up the action that caused it

The server SHALL send webhooks in the background: the request or meeting action that produced an event SHALL complete with the same result whether its webhooks are delivered, retried or dropped.

#### Scenario: Slow receiver during a REST call

- **GIVEN** a webhook whose URL takes 5 seconds to answer
- **WHEN** a moderator promotes a participant through `participantUpdateRole`
- **THEN** the REST API answers without waiting for the `participantRoleChanged` delivery
