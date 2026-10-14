# Room Members Specification

## Purpose

Room members are the registered users and identified guests explicitly granted access to one room, each with a base role and optional permission overrides, and this capability issues the room member tokens every participant uses. Room managers and integrators rely on it to give named people controlled, individually revocable access to a room.

Surfaces: REST API (`addRoomMember`, `getRoomMembers`, `getRoomMember`, `updateRoomMember`, `deleteRoomMember`, `bulkDeleteRoomMembers`; `meet-ce/backend/openapi/room-members/`), internal API (`generateRoomMemberToken`, `refreshRoomMemberToken`; `meet-ce/backend/openapi/room-members/internal/`), typings TSDoc of `MeetRoomMember` and `MeetRoomMemberTokenOptions` (`meet-ce/typings/src/database/room-member.entity.ts`, `meet-ce/typings/src/request/room-member-request.ts`), console (Room Members tab of the room detail page, add and edit member pages, members queued in the room wizard). Documented in openvidu.io `docs/meet/features/room-members/` and `docs/meet/features/rooms/access.md`.

## Requirements

### Requirement: Adding a member
The server SHALL add a member to a room through `addRoomMember` as either a user, named by `userId`, or an identified guest, named by `name`, never both and never neither, with a `baseRole` of `moderator` or `speaker` and optional `customPermissions`, answering `201` with the member and a `Location` header that points to it.

#### Scenario: Add an identified guest
- **GIVEN** a room the caller manages
- **WHEN** the caller calls `addRoomMember` with `name` "Alice Smith" and `baseRole` `speaker`
- **THEN** the server answers `201` with a member of `type` `identified_guest` named "Alice Smith"
- **AND** the `Location` header is the member's URL, ending with `/api/v1/rooms/{roomId}/members/{memberId}`

#### Scenario: Both identities or none
- **WHEN** the request carries both `userId` and `name`, or neither of them
- **THEN** the server answers `422` and adds no member

#### Scenario: Invalid fields
- **WHEN** `name` is empty or longer than 50 characters, `userId` holds characters other than lowercase letters, digits and underscores, or `baseRole` is missing or unknown
- **THEN** the server answers `422`

#### Scenario: Room does not exist
- **WHEN** the caller adds a member to a room that does not exist
- **THEN** the server answers `404`

### Requirement: User members
A user member SHALL take the user's `userId` as its `memberId` and the user's name as its `name`, and its `accessUrl` SHALL be the room's shared user access URL, where the user logs in. The server SHALL answer `404` for a `userId` that names no user and `409` for a user who already is a member of the room, an admin, or the room owner.

#### Scenario: Add a registered user
- **GIVEN** a user `alice_smith` with role `room_member`
- **WHEN** a manager of a room adds her with `userId` `alice_smith`
- **THEN** the member has `memberId` `alice_smith`, `type` `user` and her profile name
- **AND** its `accessUrl` is the room's user access URL, the same for every user member

#### Scenario: Unknown user
- **WHEN** a manager adds a member with a `userId` that names no user
- **THEN** the server answers `404`

#### Scenario: Already a member
- **GIVEN** a user who is already a member of the room
- **WHEN** a manager adds them again
- **THEN** the server answers `409` saying they are already a member

#### Scenario: Admin or owner
- **WHEN** a manager adds an admin, or the room's owner, as a member
- **THEN** the server answers `409` saying they cannot be added because they are the room owner or an admin

### Requirement: Identified guest members
An identified guest SHALL get a generated `memberId` that starts with `guest-`, and an `accessUrl` that is the room URL carrying that `memberId` as its `secret`, a personal link that grants access to the room without any login while the member exists.

#### Scenario: Personal access link
- **WHEN** a manager adds an identified guest to room `room-123`
- **THEN** the member's `memberId` starts with `guest-`
- **AND** its `accessUrl` ends with `/room/room-123?secret=` followed by that `memberId`

### Requirement: Effective permissions
The server SHALL compute a member's `effectivePermissions` as the permission set of its base role in the room (see `room-access`) with every key of `customPermissions` overriding the role's value, and SHALL set `permissionsUpdatedAt` each time it computes them.

#### Scenario: Override on top of the role
- **GIVEN** a room whose speaker role denies `recordingControl` and grants `mediaShareScreen`
- **WHEN** a manager adds a member with `baseRole` `speaker` and `customPermissions` granting `recordingControl` and denying `mediaShareScreen`
- **THEN** the member's `effectivePermissions` grant `recordingControl`, deny `mediaShareScreen` and match the speaker role for every other key

#### Scenario: No overrides
- **WHEN** a manager adds a member with `baseRole` `moderator` and no `customPermissions`
- **THEN** the member's `effectivePermissions` equal the room's moderator role permissions

### Requirement: Members follow their room role
When the permission set of a room role changes through `updateRoomRoles` (see `room-access`), the server SHALL recompute the `effectivePermissions` of every member of the room from the new role sets, keeping each member's `customPermissions`, and SHALL advance their `permissionsUpdatedAt`.

#### Scenario: Role permission changed
- **GIVEN** a speaker member with `customPermissions` granting `recordingControl`
- **WHEN** a manager denies `chatWrite` to the room's speaker role
- **THEN** the member's `effectivePermissions` deny `chatWrite` and still grant `recordingControl`

### Requirement: Effective permissions on request only
The server SHALL leave `effectivePermissions` out of every member response unless the request names it in the `extraFields` query parameter or the `X-ExtraFields` header, on `addRoomMember`, `getRoomMembers`, `getRoomMember` and `updateRoomMember` alike; `fields` or `X-Fields` SHALL restrict a response to the fields they name, ignoring unknown names.

#### Scenario: Default response
- **WHEN** a manager calls `getRoomMember` without `extraFields`
- **THEN** the member carries `customPermissions` but no `effectivePermissions`

#### Scenario: Requested on an update
- **WHEN** a manager calls `updateRoomMember` with the header `X-ExtraFields: effectivePermissions`
- **THEN** the returned member carries `effectivePermissions`

#### Scenario: Field selection
- **WHEN** a manager calls `getRoomMembers` with `fields=accessUrl,baseRole,unknownField`
- **THEN** every member in the page carries only `accessUrl` and `baseRole`

### Requirement: Who manages members
The server SHALL allow `addRoomMember`, `getRoomMembers`, `updateRoomMember`, `deleteRoomMember` and `bulkDeleteRoomMembers` only with an API key or the access token of an admin or of the room's owner. It SHALL answer `401` to a request without either credential, a room member token not being one, and `403` to any other user, including members of the room.

#### Scenario: Owner manages members
- **GIVEN** a `room_manager` who owns a room
- **WHEN** they add, list, update and delete members of that room
- **THEN** every request succeeds

#### Scenario: Manager who is only a member
- **GIVEN** a `room_manager` who is a member, not the owner, of a room
- **WHEN** they call `addRoomMember` on that room
- **THEN** the server answers `403`

#### Scenario: Room member token
- **WHEN** a client calls `getRoomMembers` with only a room member token of that room, even a moderator's
- **THEN** the server answers `401`

### Requirement: Reading one member
`getRoomMember` SHALL be allowed with an API key, to an admin, to the room's owner, to a `room_manager` reading their own membership, and with a room member token issued for that same member. Any other caller SHALL get `403`, and a member or room that does not exist SHALL give `404`.

#### Scenario: Own member through a room member token
- **GIVEN** an identified guest holding a room member token obtained with their personal link
- **WHEN** they call `getRoomMember` for their own `memberId`
- **THEN** the server answers `200` with their member

#### Scenario: Another member's data
- **GIVEN** a room member token obtained with the room's anonymous moderator link
- **WHEN** its holder calls `getRoomMember` for any member
- **THEN** the server answers `403`

#### Scenario: User with role room_member
- **GIVEN** a user with role `room_member` who is a member of the room
- **WHEN** they call `getRoomMember` for their own membership with their access token
- **THEN** the server answers `403`

#### Scenario: Unknown member
- **WHEN** a manager of the room calls `getRoomMember` for a `memberId` that is not a member of it
- **THEN** the server answers `404`

### Requirement: Listing members
`getRoomMembers` SHALL return a page of the room's members filtered by `name` (match mode `exact` by default, or `prefix`, `partial` or `regex`, case-sensitive unless `nameCaseInsensitive` is `true`), `baseRole` and `type`, sorted by `membershipDate` (the default) or `name`, in descending order unless `sortOrder` says otherwise, with `maxItems` defaulting to 10 and capped at 100.

#### Scenario: Default order
- **GIVEN** a room with members added one after another
- **WHEN** a manager calls `getRoomMembers` with no parameters
- **THEN** the server returns up to 10 members, the most recently added first

#### Scenario: Next page
- **GIVEN** a room with 15 members
- **WHEN** a manager calls `getRoomMembers` with `maxItems=10` and then with the returned `nextPageToken`
- **THEN** the first page holds 10 members and reports `isTruncated` true, and the second holds the other 5

#### Scenario: Oversized page
- **WHEN** a manager calls `getRoomMembers` with `maxItems=500`
- **THEN** the page holds at most 100 members

#### Scenario: Filter by type
- **WHEN** a manager calls `getRoomMembers` with `type=identified_guest`
- **THEN** only identified guests are returned

#### Scenario: Invalid query
- **WHEN** `maxItems` is zero or negative, `nameMatchMode` or `sortField` is unknown, or `name` is an invalid regular expression with `nameMatchMode=regex`
- **THEN** the server answers `422`

#### Scenario: Invalid page token
- **WHEN** a manager passes a `nextPageToken` the server did not issue
- **THEN** the server answers `400`

### Requirement: Updating a member
`updateRoomMember` SHALL change the member's `baseRole`, its `customPermissions`, or both, recompute its `effectivePermissions` and answer `200` with the member; a `customPermissions` object SHALL replace the previous overrides as a whole, so an override it leaves out falls back to the base role. The room member tokens issued to the member before the update stop being accepted (see `authentication`).

#### Scenario: Change the base role
- **GIVEN** a speaker member without overrides
- **WHEN** a manager calls `updateRoomMember` with `baseRole` `moderator`
- **THEN** the member's `effectivePermissions` equal the room's moderator role permissions

#### Scenario: Overrides replaced
- **GIVEN** a speaker member whose overrides grant `recordingControl` and `recordingDelete`
- **WHEN** a manager updates it with `customPermissions` granting only `participantKick` and `meetingEnd`
- **THEN** the member's `customPermissions` hold only `participantKick` and `meetingEnd`
- **AND** its `effectivePermissions` deny `recordingControl` and `recordingDelete`, as the speaker role does

#### Scenario: Overrides cleared
- **WHEN** a manager updates a member with an empty `customPermissions` object
- **THEN** the member's `effectivePermissions` equal its base role permissions

#### Scenario: Empty body
- **WHEN** a manager calls `updateRoomMember` with an empty body
- **THEN** the server answers `200` and the member keeps its role and overrides

#### Scenario: Unknown member
- **WHEN** a manager updates a member that does not exist in the room
- **THEN** the server answers `404`

### Requirement: Losing meetingJoin removes the member from the meeting
When an update leaves a member without `meetingJoin` and that member is in the room's meeting, the server SHALL remove them from the meeting.

#### Scenario: Join permission revoked during a meeting
- **GIVEN** an identified guest taking part in the room's meeting
- **WHEN** a manager updates the member with `customPermissions` denying `meetingJoin`
- **THEN** the guest leaves the meeting with reason `participant_kicked`
- **AND** a new join token requested with their personal link is refused with `403`

### Requirement: Permission changes reach a member in the meeting
When an update keeps `meetingJoin` and the member is in the room's meeting, the server SHALL ask that participant's client to renew its room member token, and the meeting SHALL then apply the new permissions without the participant leaving and show them a notice that their permissions were updated. Failing to deliver that request SHALL NOT fail the update.

#### Scenario: Chat write revoked live
- **GIVEN** a user member taking part in the meeting with `chatWrite`
- **WHEN** a manager updates the member to deny `chatWrite`
- **THEN** the participant stays in the meeting, the chat panel becomes read-only and a notice says their permissions were updated

#### Scenario: Recording control granted live
- **GIVEN** a speaker member in the meeting of a room with recording enabled
- **WHEN** a manager grants the member `recordingControl`
- **THEN** the recording control appears in their meeting without rejoining

#### Scenario: Request not delivered
- **GIVEN** a member in the meeting whose client cannot be reached
- **WHEN** a manager updates that member's permissions
- **THEN** the server still answers `200`

### Requirement: A promotion survives a permission change
When a participant promoted to moderator during the meeting (see `meeting-moderation`) gets a new join token after a change of their own permissions, the token SHALL keep them promoted, with every permission that either their new permissions or the room's moderator role grants. A participant who became an admin or the room owner SHALL instead get every permission and lose the promotion.

#### Scenario: Promoted member's permissions change
- **GIVEN** a speaker member promoted to moderator in the meeting
- **WHEN** a manager changes the member's `customPermissions` and the participant's client renews its token
- **THEN** the participant is still a moderator with the moderator role permissions

#### Scenario: Promoted participant becomes admin
- **GIVEN** a user member promoted to moderator in the meeting
- **WHEN** an administrator changes that user's role to `admin` and the participant's client renews its token
- **THEN** the participant holds every permission as an admin and is no longer marked as promoted

### Requirement: Deleting a member
`deleteRoomMember` SHALL remove the member, remove them from the room's meeting if they are in it, and answer `200`; from then on the member's identified guest link SHALL no longer grant access and their room member tokens stop being accepted (see `authentication`). A member that does not exist SHALL give `404`.

#### Scenario: Guest link revoked
- **GIVEN** an identified guest with a personal access link
- **WHEN** a manager deletes the member
- **THEN** a token requested with that link's `secret` is refused with `404`

#### Scenario: Member in the meeting
- **GIVEN** a user member taking part in the room's meeting
- **WHEN** a manager deletes the member
- **THEN** the user leaves the meeting with reason `participant_kicked`

#### Scenario: Unknown member
- **WHEN** a manager deletes a member that does not exist in the room
- **THEN** the server answers `404`

### Requirement: Concurrent deletions of one member
When several deletions of the same member arrive at once, on one Meet replica or several, exactly one SHALL answer `200` and every other one `404`, never `500`.

#### Scenario: Two replicas delete the same member
- **GIVEN** two Meet replicas sharing the same database and a member of a room
- **WHEN** each replica receives `deleteRoomMember` for that member at the same time
- **THEN** one answers `200` and the other `404`

### Requirement: Bulk deletion of members
`bulkDeleteRoomMembers` SHALL take a comma-separated `memberIds` query parameter with at least one id, delete the named members that exist, removing them from the room's meeting, and answer `200` with `deleted` and an empty `failed` when every id was deleted, or `400` with both lists when an id named no member of the room, each failure carrying `Room member not found`.

#### Scenario: All deleted
- **GIVEN** a room with an identified guest and a user member
- **WHEN** a manager calls `bulkDeleteRoomMembers` with both ids
- **THEN** the server answers `200` with both ids in `deleted` and an empty `failed`

#### Scenario: Partial result
- **WHEN** a manager calls `bulkDeleteRoomMembers` with one existing id and one unknown id
- **THEN** the server answers `400` with the existing id in `deleted` and the unknown one in `failed`
- **AND** the existing member is deleted

#### Scenario: No id
- **WHEN** a manager calls `bulkDeleteRoomMembers` with an empty `memberIds`
- **THEN** the server answers `422`

#### Scenario: Concurrent bulk deletion
- **GIVEN** two members that another request deletes while a bulk deletion of both is running
- **WHEN** the bulk deletion completes
- **THEN** it answers `200` with both ids in `deleted`

### Requirement: Room member token credentials
`generateRoomMemberToken` SHALL issue a room member token for an existing room when the request carries a `secret`, which authenticates on its own, or, without one, the access token of a user who can access the room: an admin, its owner, one of its members, or any user while registered-user access is enabled (see `room-access`). It SHALL answer `401` without either credential, an API key not being one, `403` to a user without access, and `404` for a room that does not exist.

#### Scenario: Member user without secret
- **GIVEN** a user who is a member of a room
- **WHEN** they call `generateRoomMemberToken` with their access token and no `secret`
- **THEN** the server answers `200` with a token

#### Scenario: User without access
- **GIVEN** a `room_manager` who neither owns nor is a member of a room without registered-user access
- **WHEN** they call `generateRoomMemberToken` without a `secret`
- **THEN** the server answers `403`

#### Scenario: API key only
- **WHEN** a client calls `generateRoomMemberToken` with an API key and no `secret`
- **THEN** the server answers `401`

#### Scenario: Room does not exist
- **WHEN** a client asks for a token of a room that does not exist
- **THEN** the server answers `404`

### Requirement: Secrets that authenticate
A `secret` SHALL be either one of the room's anonymous access secrets (see `room-access`) or the `memberId` of an identified guest of the room. A `guest-` id that names no member of the room SHALL give `404`, and any other secret the room does not recognize `400`.

#### Scenario: Identified guest link
- **GIVEN** an identified guest of the room
- **WHEN** a client calls `generateRoomMemberToken` with `secret` set to that guest's `memberId`
- **THEN** the server answers `200` with a token bound to that member

#### Scenario: Unknown guest
- **WHEN** a client sends `secret` `guest-nonexistent`
- **THEN** the server answers `404` saying the room member was not found

#### Scenario: Unrecognized secret
- **WHEN** a client sends a `secret` that matches no access link of the room
- **THEN** the server answers `400`

### Requirement: Permissions a token carries
A room member token SHALL carry the permissions of its source: an identified guest's `effectivePermissions`; for a user, every permission when an admin or the room owner, the member's `effectivePermissions` when a member, and otherwise the room's speaker role permissions under registered-user access; for an anonymous secret, the permissions its link grants (see `room-access`).

#### Scenario: Identified guest with overrides
- **GIVEN** an identified guest whose overrides grant `participantKick` on top of the speaker role
- **WHEN** a token is issued with their personal link
- **THEN** the token carries the guest's `effectivePermissions`, `participantKick` included

#### Scenario: Owner ignores the role sets
- **GIVEN** a room whose moderator role denies `recordingDelete`
- **WHEN** its owner obtains a token without a `secret`
- **THEN** the token grants every permission, `recordingDelete` included

#### Scenario: Non-member under registered-user access
- **GIVEN** a room with registered-user access enabled and a user who is not its member
- **WHEN** that user obtains a token without a `secret`
- **THEN** the token carries the room's speaker role permissions

### Requirement: Secret and user combined
When a request carries both a `secret` and a valid user access token, the token SHALL grant every permission that either source grants, and SHALL be bound to the identified guest when the secret is one.

#### Scenario: Admin through the speaker link
- **GIVEN** an admin logged in to the console
- **WHEN** they request a token with the room's anonymous speaker secret
- **THEN** the token grants every permission and presents them as an admin

#### Scenario: Member through the moderator link
- **GIVEN** a user member with `baseRole` `speaker`
- **WHEN** they request a token with their access token and the room's anonymous moderator secret
- **THEN** the token carries every permission granted by their member permissions or by the moderator role

### Requirement: Role a token confers
A room member token SHALL fix how its holder appears in the meeting: the room owner and admins as such, acting as moderators; any other holder as a moderator when its permissions include every permission the room's moderator role grants, and as a speaker otherwise.

#### Scenario: Speaker with moderator powers
- **GIVEN** a member with `baseRole` `speaker` whose overrides grant every permission of the room's moderator role
- **WHEN** they join the meeting
- **THEN** they appear and are reported as a moderator

#### Scenario: Owner in the meeting
- **WHEN** the room owner joins the meeting
- **THEN** the participants panel marks them as the owner and webhooks report their role as `moderator`

### Requirement: Join tokens
With `joinMeeting` set to `true`, the server SHALL issue a token that connects its holder to the room's meeting with the media grant of its permissions (see `permissions`), under the `participantName` given or else the name of the member or of the user, once the join checks pass: an open room, `meetingJoin`, a known name and room below `maxParticipants`, with the refusals specified in `meeting-join`. The identity the token assigns is specified in `meetings`.

#### Scenario: Name taken from the member
- **GIVEN** an identified guest named "Alice Smith"
- **WHEN** a join token is requested with their personal link and no `participantName`
- **THEN** the token joins the meeting as "Alice Smith"

#### Scenario: Name taken from the account
- **GIVEN** a registered user who is a member of the room
- **WHEN** they request a join token with their access token and no `participantName`
- **THEN** the token joins the meeting under the name of their member record

#### Scenario: Join checks
- **GIVEN** a room member token request with `joinMeeting` for a closed room, or with the room's anonymous recording secret
- **WHEN** the server handles it
- **THEN** it answers `409` for the closed room and `403` for the recording secret, as `meeting-join` specifies

### Requirement: Tokens that do not join
Without `joinMeeting`, the server SHALL issue a token that lets its holder use what its permissions allow on the room's resources, such as its recordings, but that cannot connect to the meeting, and SHALL issue it even while the room is closed or its meeting is full.

#### Scenario: Recordings of a closed room
- **GIVEN** a closed room whose anonymous recording link is enabled
- **WHEN** a client requests a token without `joinMeeting`
- **THEN** the server answers `200` with a token that can list and play the room's recordings

### Requirement: Regenerating a join token in the meeting
When a join token request carries, as `X-Room-Member-Token`, the join token of a participant who is in the room's meeting, the new token SHALL keep that participant's identity and name, and their `participantExternalId` and `participantMetadata` unless the request provides new ones, and the server SHALL apply the new permissions to the live participant at once (see `permissions`). A participant not in the meeting SHALL give `404`.

#### Scenario: Same identity after a permission change
- **GIVEN** a member in the meeting whose permissions were just updated
- **WHEN** their client requests a join token with its secret and its current join token as `X-Room-Member-Token`
- **THEN** the new token keeps the participant's identity and name
- **AND** the participant's camera grant follows the new `mediaPublishVideo` value without reconnecting

#### Scenario: Participant not in the meeting
- **GIVEN** a join token whose participant never connected
- **WHEN** a client requests a new join token carrying it as `X-Room-Member-Token`
- **THEN** the server answers `404`

### Requirement: Refreshing a join token
`refreshRoomMemberToken` SHALL reissue, for a participant in the room's meeting, a token with the permissions and role they hold there at that moment, a promotion included, keeping their identity, name and correlation fields. It SHALL require in `X-Room-Member-Token` a join token expired at most 10 seconds ago (`401` otherwise, also for a token that does not join), and answer `403` for another room's token and `404` when the participant is not in the meeting.

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

### Requirement: One change at a time per participant
The server SHALL apply the join token regenerations and refreshes of a participant one after the other with that participant's role changes (see `meeting-moderation`), across every Meet replica, and SHALL answer `409` to a regeneration or refresh that cannot start within about 3 seconds because another change of that participant is still in progress.

#### Scenario: Refresh and promotion on two replicas
- **GIVEN** two Meet replicas and a speaker in the meeting
- **WHEN** one replica promotes the speaker while the other regenerates the speaker's join token
- **THEN** the two changes apply one after the other and the regeneration does not undo the promotion
- **AND** the participant ends up a moderator

#### Scenario: Change still in progress
- **GIVEN** a participant held by another change for longer than about 3 seconds
- **WHEN** their client calls `refreshRoomMemberToken`
- **THEN** the server answers `409` saying the participant is already being updated

### Requirement: The meeting keeps its token current
The meeting SHALL renew the participant's join token through `refreshRoomMemberToken` shortly before it expires, and SHALL repeat a renewal that fails without an access refusal, up to six attempts with a growing delay, keeping the current token meanwhile; a renewal refused with `401`, `403` or `404` ends as specified in `meeting-join` (Access lost during the meeting).

#### Scenario: Meeting longer than the token lifetime
- **GIVEN** a participant who stays in a meeting longer than `MEET_ROOM_MEMBER_TOKEN_EXPIRATION`
- **WHEN** their token is about to expire
- **THEN** the meeting obtains a new one and the participant stays in the meeting

#### Scenario: Server briefly unreachable
- **GIVEN** a participant whose token renewal fails because the server is unreachable
- **WHEN** the server is back before the attempts run out
- **THEN** the participant stays in the meeting with a renewed token

### Requirement: Recovery from an outdated token
When the server refuses a request of the meeting, the room recordings page or the recording view page with `401` because the room member token is no longer accepted, the page SHALL obtain a new token with the credentials the visitor entered with and retry the request with it; a refusal of the new token ends as specified in `meeting-join` (Access lost during the meeting).

#### Scenario: Room roles changed while browsing recordings
- **GIVEN** a participant viewing the room's recordings with a room member token
- **WHEN** a manager updates the room roles and the participant opens another recording
- **THEN** the page obtains a new token and the recording opens

### Requirement: Console Room Members tab
For a room the user can manage (an admin or its owner), the console room detail page SHALL show a Room Members tab listing each member's name, base role and type, with a name search (prefix match by default), filters by base role and type, sorting, loading of further pages, and actions to add a member, edit one, copy its access link, delete it, and delete a selection of members.

#### Scenario: Copy an identified guest's link
- **GIVEN** the Room Members tab of a room with an identified guest
- **WHEN** the owner copies that member's access link
- **THEN** the clipboard holds the guest's personal `accessUrl`

#### Scenario: Not a manager
- **GIVEN** a user who is a member, not the owner, of a room
- **WHEN** they open the room detail page
- **THEN** no Room Members tab is shown

### Requirement: Console member deletion
The console SHALL ask for confirmation before deleting one member or a selection, warning that members in the room's ongoing meeting are removed from it when the room has an active meeting, and after a bulk deletion SHALL report how many members were removed and how many could not be.

#### Scenario: Deleting during a meeting
- **GIVEN** a room with an active meeting
- **WHEN** the owner deletes a member from the Room Members tab
- **THEN** the confirmation warns that the member is removed from the ongoing meeting

#### Scenario: Partial bulk deletion
- **GIVEN** a selection of three members, one of which another manager deleted meanwhile
- **WHEN** the owner deletes the selection
- **THEN** the console reports two members removed and one that could not be removed

### Requirement: Console member form
The console SHALL let an admin or the room's owner add a member at `/rooms/{roomId}/members/new` and edit one at `/rooms/{roomId}/members/{memberId}/edit`, choosing the member type, the user (searched among existing users, admins and the owner shown but not selectable) or the guest name, the base role, and one toggle per permission; editing SHALL keep the type and identity fixed.

#### Scenario: Admin cannot be picked
- **WHEN** the owner searches users in the add member form
- **THEN** admins and the owner appear disabled with the reason they cannot be added

#### Scenario: Edit keeps the identity
- **WHEN** the owner edits an identified guest
- **THEN** the member type and name cannot be changed, while the base role and permissions can

### Requirement: Console permission toggles
The member form SHALL group the permission toggles under Meeting, Media, Recordings and Chat, start them at the values of the chosen base role, reset them to the new role's values when the role changes, and send as `customPermissions` only the toggles that differ from the role, an empty object when an edited member no longer differs.

#### Scenario: Only differences are sent
- **GIVEN** the add member form with base role `speaker`
- **WHEN** the owner switches on `recordingControl` and saves
- **THEN** the member is added with `customPermissions` holding only `recordingControl`

#### Scenario: Overrides removed on edit
- **GIVEN** a member with overrides being edited
- **WHEN** the owner sets every toggle back to the role's value and saves
- **THEN** the member is updated with an empty `customPermissions` object

### Requirement: Members queued in the room wizard
When creating a room, the console wizard SHALL let the user queue members in the Room Access step with the same form, and SHALL add them right after creating the room; members that cannot be added SHALL be named in a warning while the room stays created (see `rooms`).

#### Scenario: Queued members added
- **GIVEN** a user who queued an identified guest and a user member in the wizard
- **WHEN** they create the room
- **THEN** the room's Room Members tab lists both members
