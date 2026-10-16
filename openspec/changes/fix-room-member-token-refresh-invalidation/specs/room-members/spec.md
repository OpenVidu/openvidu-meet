## MODIFIED Requirements

### Requirement: Refreshing a join token
`refreshRoomMemberToken` SHALL reissue, for a participant in the room's meeting, a token with the permissions and role they hold there at that moment, a promotion included, keeping their identity, name and correlation fields. It SHALL require in `X-Room-Member-Token` a join token expired at most 10 seconds ago that no later change but a demotion invalidated (see `authentication`), answering `401` otherwise, `403` for another room's token and `404` when the participant is not in the meeting.

#### Scenario: Refresh after a promotion
- **GIVEN** a speaker promoted to moderator in the meeting
- **WHEN** their client calls `refreshRoomMemberToken` with its join token
- **THEN** the new token carries the moderator permissions and the promoted moderator role

#### Scenario: Just expired
- **GIVEN** a join token that expired 2 seconds ago for a participant in the meeting
- **WHEN** the client refreshes it
- **THEN** the server answers `200`

#### Scenario: Long expired
- **GIVEN** a join token that expired more than 10 seconds ago
- **WHEN** the client refreshes it
- **THEN** the server answers `401`

#### Scenario: Token that does not join
- **WHEN** a client calls `refreshRoomMemberToken` with a token issued without `joinMeeting`
- **THEN** the server answers `401`

#### Scenario: Another room
- **WHEN** a client calls `refreshRoomMemberToken` for a room with a join token of a different room
- **THEN** the server answers `403`

#### Scenario: Member permissions changed after the token
- **GIVEN** a user member in the meeting whose join token grants `participantKick`
- **WHEN** a manager updates the member to deny `participantKick`
- **AND** the member's client calls `refreshRoomMemberToken` with the join token issued before the update
- **THEN** the server answers `401` with message `Invalid token`

#### Scenario: Account role changed after the token
- **GIVEN** an admin in the meeting of a room they neither own nor belong to
- **WHEN** an administrator changes that user's role to `room_manager`
- **AND** the participant's client calls `refreshRoomMemberToken` with the join token issued before the change
- **THEN** the server answers `401` with message `Invalid token`

#### Scenario: Demoted after the token
- **GIVEN** a participant promoted to moderator who holds a join token issued during the promotion
- **WHEN** a moderator demotes them
- **AND** their client calls `refreshRoomMemberToken` with that token
- **THEN** the server answers `200` with a token carrying the permissions they had before the promotion, without the promoted moderator role

#### Scenario: Change made through another replica
- **GIVEN** two Meet replicas and a user member in the meeting
- **WHEN** a manager updates the member's permissions through the first replica
- **AND** the member's client calls `refreshRoomMemberToken` through the second replica with the join token issued before the update
- **THEN** the second replica answers `401`

### Requirement: The meeting keeps its token current
The meeting SHALL renew the participant's join token through `refreshRoomMemberToken` shortly before it expires, repeating one that fails without an access refusal up to six attempts with a growing delay, keeping the current token meanwhile. After a refresh refused with `401` it SHALL request a new join token with the credentials the participant entered with; a refusal of that request, or a refresh refused with `403` or `404`, ends as specified in `meeting-join` (Access lost during the meeting).

#### Scenario: Meeting longer than the token lifetime
- **GIVEN** a participant who stays in a meeting longer than `MEET_ROOM_MEMBER_TOKEN_EXPIRATION`
- **WHEN** their token is about to expire
- **THEN** the meeting obtains a new one and the participant stays in the meeting

#### Scenario: Server briefly unreachable
- **GIVEN** a participant whose token renewal fails because the server is unreachable
- **WHEN** the server is back before the attempts run out
- **THEN** the participant stays in the meeting with a renewed token

#### Scenario: Permissions notice missed
- **GIVEN** a member in the meeting whose client did not receive the notice that a manager denied them `chatWrite`
- **WHEN** their next renewal through `refreshRoomMemberToken` is refused with `401`
- **THEN** the meeting obtains a new join token with the credentials the member entered with
- **AND** the member stays in the meeting with a read-only chat

#### Scenario: Demoted participant
- **GIVEN** a participant promoted to moderator in the meeting
- **WHEN** a moderator demotes them
- **THEN** they stay in the meeting with the permissions they had before the promotion

#### Scenario: Access withdrawn while the notice was missed
- **GIVEN** an admin in the meeting of a room they neither own nor belong to, whose client did not receive the notice of a change of their role to `room_manager`
- **WHEN** their next renewal is refused with `401` and the new join token request with `403`
- **THEN** they are taken to the "Room access revoked" error screen
