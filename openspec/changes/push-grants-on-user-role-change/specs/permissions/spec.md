## ADDED Requirements

### Requirement: The media grant follows a user's role change
When a user's role changes while they are in a meeting, the server SHALL apply the permissions of the new role to their live connection at once, without waiting for their client to renew its token, and SHALL remove them from the meeting when the new role leaves them without access to the room.

#### Scenario: Administrator turned room member
- **GIVEN** an administrator publishing camera and screen in a meeting, with a client that never renews its token
- **WHEN** an administrator changes their role to `room_member` and they have no member permissions in the room
- **THEN** they are removed from the meeting

#### Scenario: Role change that keeps access
- **GIVEN** a `room_manager` who is a member of the room and publishes their camera
- **WHEN** an administrator changes their role to `room_member` and the member permissions deny `mediaPublishVideo`
- **THEN** the media server stops accepting their camera without them leaving the meeting
