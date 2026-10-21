# Users Specification

## Purpose

User accounts let people log in to Meet with a `userId` and a password, and their user role decides what they may administer. Administrators manage accounts from the console or through the REST API, and integrators automate that with the API key.

Surfaces: REST API (`createUser`, `getUsers`, `getUser`, `updateUserRole`, `resetUserPassword`, `deleteUser`, `bulkDeleteUsers` under `/api/v1/users`; internal `getMe` and `changeUserPassword` under `/internal-api/v1/users`; `meet-ce/backend/openapi/users/`), startup configuration (`MEET_INITIAL_ADMIN_USER`, `MEET_INITIAL_ADMIN_PASSWORD`), console (users list, create user, user profile and own profile pages, forced password change page). Documented in openvidu.io `docs/meet/features/users/`. Logging in and the credentials a request carries are specified in `authentication`.

## Requirements

### Requirement: User roles
The server SHALL give every user account exactly one user role: `admin`, who administers the whole deployment, `room_manager`, who creates rooms and manages the rooms they own, or `room_member`, who only reaches the rooms they are given access to. What each role may do on rooms, room members and recordings is specified in `rooms`, `room-members` and `permissions`.

#### Scenario: Unknown role rejected
- **GIVEN** an administrator
- **WHEN** they call `createUser` or `updateUserRole` with a role other than `admin`, `room_manager` or `room_member`
- **THEN** the server answers `422` naming the `role` field
- **AND** no account is created or changed

### Requirement: Access to user management
The server SHALL accept `createUser`, `updateUserRole`, `resetUserPassword`, `deleteUser` and `bulkDeleteUsers` only with the API key or the access token of an `admin` user, and `getUsers` and `getUser` also with the access token of a `room_manager` user.

#### Scenario: Room manager reads users
- **GIVEN** a user with role `room_manager`
- **WHEN** they call `getUsers` or `getUser`
- **THEN** the server answers `200`

#### Scenario: Room manager cannot manage users
- **GIVEN** a user with role `room_manager`
- **WHEN** they call `createUser`, `updateUserRole`, `resetUserPassword`, `deleteUser` or `bulkDeleteUsers`
- **THEN** the server answers `403`

#### Scenario: Room member cannot read users
- **GIVEN** a user with role `room_member`
- **WHEN** they call `getUsers` or `getUser`
- **THEN** the server answers `403`

#### Scenario: API key manages users
- **GIVEN** a request authenticated with the API key
- **WHEN** it calls any user management operation
- **THEN** the server performs it as the root admin would

### Requirement: Create a user
The server SHALL create an account through `createUser` with the given `userId`, name, role and initial password, answer `201` with the new user and a `Location` header pointing to `/api/v1/users/{userId}`, and require that user to change the initial password at their first login.

#### Scenario: Account created
- **GIVEN** an administrator
- **WHEN** they call `createUser` with `userId` `alice_smith`, a name, role `room_manager` and a valid password
- **THEN** the server answers `201` with the user, its `registrationDate` and `roleUpdatedAt`
- **AND** the `Location` header ends in `/api/v1/users/alice_smith`

#### Scenario: First login demands a new password
- **GIVEN** a user just created through `createUser`
- **WHEN** they log in with the initial password
- **THEN** the login succeeds with `mustChangePassword` set to `true`

### Requirement: User account validation
The server SHALL answer `422`, listing each offending field, to a `createUser` whose `userId` is not 5 to 20 characters of lowercase letters, digits and underscores, whose name is empty or longer than 50 characters, whose password is shorter than 5 characters, or whose role is missing.

#### Scenario: Uppercase user ID
- **WHEN** an administrator calls `createUser` with `userId` `Alice_Smith`
- **THEN** the server answers `422` naming `userId`

#### Scenario: Short password
- **WHEN** an administrator calls `createUser` with a 4-character password
- **THEN** the server answers `422` naming `password`

### Requirement: Unique user IDs
The server SHALL keep `userId` unique across the deployment and answer `409` to a `createUser` whose `userId` already belongs to an account, including when two creations of the same `userId` reach different replicas at the same time.

#### Scenario: Existing user ID
- **GIVEN** an account with `userId` `alice_smith`
- **WHEN** an administrator calls `createUser` with `userId` `alice_smith`
- **THEN** the server answers `409`
- **AND** the existing account is unchanged

#### Scenario: Simultaneous creation on two replicas
- **GIVEN** two Meet replicas sharing the same database
- **WHEN** each receives a `createUser` for `userId` `bob_jones` at the same time
- **THEN** exactly one account `bob_jones` exists afterwards
- **AND** one request answers `201` and the other `409`

### Requirement: No credentials in user responses
The server SHALL never include a password, a password hash or the pending password change state in any user returned by `createUser`, `getUsers`, `getUser`, `updateUserRole` or `getMe`.

#### Scenario: Reading a user
- **WHEN** an administrator calls `getUser` for any account
- **THEN** the response carries `userId`, `name`, `registrationDate`, `role` and `roleUpdatedAt`
- **AND** it carries no password data

### Requirement: List users
The server SHALL return users from `getUsers` one page at a time, sorted by `registrationDate` descending unless `sortField` (`name` or `registrationDate`) and `sortOrder` (`asc` or `desc`) say otherwise, with `maxItems` defaulting to 10, a value above 100 lowered to 100 and echoed in `pagination.maxItems`, and `nextPageToken` continuing the listing.

#### Scenario: Default page
- **GIVEN** 15 accounts
- **WHEN** a caller calls `getUsers` without parameters
- **THEN** the server answers with the 10 most recently registered users
- **AND** `pagination.isTruncated` is `true` with a `nextPageToken`

#### Scenario: Oversized page
- **WHEN** a caller calls `getUsers` with `maxItems` 500
- **THEN** the page holds at most 100 users and `pagination.maxItems` is 100

#### Scenario: Invalid paging values
- **WHEN** a caller calls `getUsers` with `maxItems` 0 or a negative value
- **THEN** the server answers `422`
- **AND** an unreadable `nextPageToken` answers `400`

### Requirement: Filter users
The server SHALL narrow `getUsers` by `role`, by exact `userId`, and by `name` matched as `nameMatchMode` says (`exact` by default, `prefix`, `partial` or `regex`), case-sensitively unless `nameCaseInsensitive` is `true`. When both `userId` and `name` are given, a user matching either one is returned.

#### Scenario: Partial name match
- **GIVEN** users named `Alice Smith` and `Bob Smith`
- **WHEN** a caller calls `getUsers` with `name` `smith`, `nameMatchMode` `partial` and `nameCaseInsensitive` `true`
- **THEN** both users are returned

#### Scenario: Search by user ID or name
- **GIVEN** a user `alice_smith` named `Alice` and a user `bob_jones` named `alice`
- **WHEN** a caller calls `getUsers` with `userId` `alice_smith`, `name` `alice` and `nameMatchMode` `prefix`
- **THEN** both users are returned

#### Scenario: Invalid regular expression
- **WHEN** a caller calls `getUsers` with `nameMatchMode` `regex` and a `name` that is not a valid regular expression or is longer than 100 characters
- **THEN** the server answers `422` naming `name`

### Requirement: Get a user
The server SHALL return the account identified by `userId` from `getUser`, and answer `404` when no account has that `userId`.

#### Scenario: Unknown user
- **WHEN** a caller calls `getUser` for a `userId` that does not exist
- **THEN** the server answers `404`

### Requirement: Own account
The server SHALL return the account of the caller from `getMe` for a user of any role, accepting only an access token (not the API key), also while the user has a password change pending.

#### Scenario: Room member reads their account
- **GIVEN** a logged-in user with role `room_member`
- **WHEN** they call `getMe`
- **THEN** the server answers `200` with their own account

#### Scenario: API key alone
- **WHEN** a request carrying only the API key calls `getMe`
- **THEN** the server answers `401`

### Requirement: Change own password
The server SHALL let any logged-in user replace their password through `changeUserPassword` by giving the current one, answer `400` when the current password is wrong and `422` when the new one is shorter than 5 characters, and accept only the new password at later logins. A successful change SHALL answer `200` with a new `accessToken` and `refreshToken` and SHALL reject, on every replica, every access token and refresh token issued to the user before it.

#### Scenario: Password changed
- **GIVEN** a logged-in user without a pending password change
- **WHEN** they call `changeUserPassword` with their current password and a new valid one
- **THEN** the server answers `200` with an `accessToken` and a `refreshToken`
- **AND** logging in with the old password fails and with the new one succeeds

#### Scenario: Other sessions signed out
- **GIVEN** a user logged in from two browsers
- **WHEN** they change their password from the first one
- **THEN** the second browser's access token answers `401` with message `Invalid token`
- **AND** its refresh token answers `400` with message `Invalid refresh token`
- **AND** the tokens the change returned are accepted

#### Scenario: Change on another replica
- **GIVEN** two Meet replicas and a user logged in from two browsers
- **WHEN** the user changes their password through the first replica
- **AND** the second browser presents its earlier access token to the second replica
- **THEN** the second replica answers `401` with message `Invalid token`

#### Scenario: Wrong current password
- **WHEN** a user calls `changeUserPassword` with a wrong current password
- **THEN** the server answers `400` and the password is unchanged

### Requirement: Forced password change
The server SHALL keep an account created by `createUser` or reset by `resetUserPassword` in a pending password change state until its user calls `changeUserPassword`. While pending, the user's access tokens reach only `getMe` and `changeUserPassword` (every other endpoint that takes an access token answers `403` saying a password change is required), and completing the change returns a new access token and refresh token.

#### Scenario: Pending user blocked elsewhere
- **GIVEN** a user with a pending password change who has logged in
- **WHEN** they call `getRooms` or any other endpoint that takes an access token, except `getMe` and `changeUserPassword`
- **THEN** the server answers `403` saying a password change is required

#### Scenario: Completing the change
- **GIVEN** a user with a pending password change who has logged in
- **WHEN** they call `changeUserPassword` with the temporary password and a new one
- **THEN** the server answers `200` with an `accessToken` and a `refreshToken`
- **AND** with those tokens the user reaches every endpoint their role allows

### Requirement: Reset another user's password
The server SHALL let an administrator set a new password for another account through `resetUserPassword`, putting that account in the pending password change state, and answer `404` when the `userId` does not exist.

#### Scenario: Password reset
- **GIVEN** a user `bob_jones` who is logged in elsewhere
- **WHEN** an administrator calls `resetUserPassword` for `bob_jones` with a new password
- **THEN** the server answers `200`
- **AND** `bob_jones` logs in with the new password and is asked to change it
- **AND** the tokens `bob_jones` held before reach only `getMe` and `changeUserPassword`

#### Scenario: Unknown user
- **WHEN** an administrator calls `resetUserPassword` for a `userId` that does not exist
- **THEN** the server answers `404`

### Requirement: Update a user's role
The server SHALL change the role of an account through `updateUserRole` and answer `200` with the updated user, `404` when the `userId` does not exist, and `200` with the account unchanged when the requested role is the current one. A role change takes effect at once on the user's existing tokens, as specified in `authentication`.

#### Scenario: Role changed
- **GIVEN** a user with role `room_member`
- **WHEN** an administrator calls `updateUserRole` with role `room_manager`
- **THEN** the server answers `200` with role `room_manager` and a newer `roleUpdatedAt`

#### Scenario: Same role
- **GIVEN** a user with role `room_manager`
- **WHEN** an administrator calls `updateUserRole` with role `room_manager`
- **THEN** the server answers `200` with `roleUpdatedAt` unchanged
- **AND** the tokens the user holds stay valid

### Requirement: Rooms and memberships follow a role change
The server SHALL hand every room owned by a user whose role changes to `room_member` over to the root admin, each room keeping its recordings, and SHALL remove every room membership of a user whose role changes to `admin`. Other role changes keep owned rooms and memberships. A room deleted while its ownership moves does not fail the role change.

#### Scenario: Manager becomes room member
- **GIVEN** a `room_manager` who owns two rooms
- **WHEN** an administrator changes their role to `room_member`
- **THEN** both rooms are owned by the root admin and keep their recordings

#### Scenario: Room member becomes admin
- **GIVEN** a `room_member` who is a member of three rooms
- **WHEN** an administrator changes their role to `admin`
- **THEN** none of those rooms lists them as a member any more

#### Scenario: Room deleted during the transfer
- **GIVEN** a `room_manager` who owns a room that another request is deleting
- **WHEN** an administrator changes their role to `room_member`
- **THEN** the role change answers `200` and every remaining room is owned by the root admin

### Requirement: Role change during a meeting
When a user whose role changes is in an active meeting and keeps access to its room, the meeting SHALL recompute their permissions from the new role without them leaving, and show them a notice that their permissions were updated. A user the new role leaves without access to the room is taken out of the meeting as `meeting-join` specifies (Access lost during the meeting).

#### Scenario: Promoted while in a meeting
- **GIVEN** a `room_member` taking part in a meeting of a room where they are a member with limited permissions
- **WHEN** an administrator changes their role to `admin`
- **THEN** they stay in the meeting with every permission of an administrator
- **AND** they see a notice that their permissions were updated

### Requirement: Delete a user
The server SHALL delete an account through `deleteUser`, answering `200`, or `404` when the `userId` does not exist. Deleting a user removes them from every meeting they are in, removes all their room memberships, and hands every room they own over to the root admin, each room keeping its recordings.

#### Scenario: Owner deleted
- **GIVEN** a `room_manager` who owns a room, is a member of another and is in a meeting
- **WHEN** an administrator calls `deleteUser` for them
- **THEN** the server answers `200`
- **AND** they are removed from the meeting
- **AND** the owned room belongs to the root admin and keeps its recordings
- **AND** the other room no longer lists them as a member

#### Scenario: Unknown user
- **WHEN** an administrator calls `deleteUser` for a `userId` that does not exist
- **THEN** the server answers `404`

### Requirement: Bulk delete users
The server SHALL delete every account listed in the comma-separated `userIds` of `bulkDeleteUsers` that can be deleted, with the same effects as `deleteUser`, and answer `200` with the `deleted` list and an empty `failed` list when all were deleted, or `400` with `deleted` and a `failed` entry (`userId` and `error`) for each root admin, own account or unknown `userId`. An empty `userIds` answers `422`.

#### Scenario: Mixed result
- **GIVEN** two existing users and one unknown `userId`
- **WHEN** an administrator calls `bulkDeleteUsers` with those three IDs and the root admin's
- **THEN** the server answers `400`
- **AND** `deleted` lists the two existing users, who are gone
- **AND** `failed` lists the unknown `userId` with `User not found` and the root admin with `Cannot delete the root admin user`

#### Scenario: Empty list
- **WHEN** an administrator calls `bulkDeleteUsers` with an empty `userIds`
- **THEN** the server answers `422`

### Requirement: Concurrent changes to the same user
The server SHALL answer `404`, never `500`, to an operation on a user that a concurrent request deleted, on whichever replica each request runs, and a bulk deletion SHALL report as deleted the users a concurrent request removed first.

#### Scenario: Two replicas delete the same user
- **GIVEN** two Meet replicas sharing the same database and an account `carol_lee`
- **WHEN** both receive `deleteUser` for `carol_lee` at the same time
- **THEN** one answers `200` and the other `404`

#### Scenario: Reset of a vanishing user
- **GIVEN** an account being deleted by another request
- **WHEN** an administrator calls `resetUserPassword` for it and the deletion lands first
- **THEN** the server answers `404`

### Requirement: Root admin bootstrap
At every startup the server SHALL create, when no account has the `userId` set in `MEET_INITIAL_ADMIN_USER` (default `admin`), an `admin` account with that `userId`, the password in `MEET_INITIAL_ADMIN_PASSWORD` (default `admin`) and no pending password change. An existing account is left untouched, so a later change of `MEET_INITIAL_ADMIN_PASSWORD` does not change its password.

#### Scenario: First start
- **GIVEN** an empty database and default configuration
- **WHEN** Meet starts
- **THEN** the user `admin` can log in with password `admin` without being asked to change it

#### Scenario: Password variable changed later
- **GIVEN** a root admin who changed their password
- **WHEN** Meet restarts with a different `MEET_INITIAL_ADMIN_PASSWORD`
- **THEN** only the password the root admin chose logs them in

#### Scenario: Two replicas start together
- **GIVEN** two Meet replicas starting at the same time on an empty database
- **WHEN** both finish starting
- **THEN** exactly one account with the `MEET_INITIAL_ADMIN_USER` `userId` exists

#### Scenario: Root admin user ID changed
- **GIVEN** a deployment whose root admin is `admin`
- **WHEN** Meet restarts with `MEET_INITIAL_ADMIN_USER` set to `root_admin`
- **THEN** a new root admin `root_admin` is created
- **AND** `admin` remains as an ordinary `admin` account

### Requirement: Root admin protection
The server SHALL answer `403` to `deleteUser`, `updateUserRole` and `resetUserPassword` targeting the root admin, the account whose `userId` equals `MEET_INITIAL_ADMIN_USER`. The root admin changes its own password through `changeUserPassword`.

#### Scenario: Deleting the root admin
- **WHEN** an administrator calls `deleteUser` for the root admin
- **THEN** the server answers `403` and the account remains

#### Scenario: Demoting the root admin
- **WHEN** an administrator calls `updateUserRole` for the root admin
- **THEN** the server answers `403` and its role stays `admin`

#### Scenario: Resetting the root admin password
- **WHEN** an administrator calls `resetUserPassword` for the root admin
- **THEN** the server answers `403`

### Requirement: Own account protection
The server SHALL answer `403` when an administrator calls `deleteUser`, `updateUserRole` or `resetUserPassword` on their own account; they change their own password through `changeUserPassword` and need another administrator for the rest.

#### Scenario: Deleting oneself
- **GIVEN** a logged-in `admin` user
- **WHEN** they call `deleteUser` with their own `userId`
- **THEN** the server answers `403`

#### Scenario: Changing one's own role
- **GIVEN** a logged-in `admin` user
- **WHEN** they call `updateUserRole` on their own account
- **THEN** the server answers `403`

### Requirement: Console users list
The console SHALL offer a Users page only to `admin` users, listing accounts with their role and registration date, searchable by name with a choice of match mode, filterable by role, sortable by name or registration date and loading further pages on demand. The rows of the root admin and of the signed-in user are marked, cannot be selected for bulk deletion, and their role change, password reset and delete actions are disabled.

#### Scenario: Non-admin opens the page
- **GIVEN** a user with role `room_manager` signed in to the console
- **WHEN** they open the Users page address
- **THEN** the console sends them to the rooms page instead

#### Scenario: Protected rows
- **GIVEN** an administrator on the Users page
- **WHEN** the list shows the root admin and their own account
- **THEN** neither row can be selected nor offers role change, password reset or delete

### Requirement: Console user actions
The console SHALL let an administrator create a user (role `room_manager` preselected, with a generator and a copy button for the temporary password), change a user's role in a dialog warning that a change to `room_member` hands owned rooms to the root admin and a change to `admin` removes room memberships, reset a password with a generated temporary one, and delete one or several users after a confirmation.

#### Scenario: Bulk delete with failures
- **GIVEN** an administrator who selected several users, one of them deleted meanwhile by someone else
- **WHEN** they confirm the bulk deletion
- **THEN** the deleted users leave the list
- **AND** a notice reports how many users were deleted and how many could not be

### Requirement: Console profile pages
The console SHALL show every signed-in user their own profile, with a form to change their password that asks for the current password and the new one twice, rejecting a new password equal to the current one. An administrator opening another user's profile sees that user's details and the role change, password reset and delete actions, except for the root admin; a `room_manager` sees the details only.

#### Scenario: Changing one's password from the profile
- **GIVEN** a signed-in user on their profile
- **WHEN** they enter a wrong current password and submit
- **THEN** the console marks the current password as incorrect and the password is unchanged

#### Scenario: Room manager views another user
- **GIVEN** a `room_manager` signed in to the console
- **WHEN** they open another user's profile
- **THEN** they see the user's details without any action

### Requirement: Console forced password change
The console SHALL send a user with a pending password change, after login, to a dedicated page that asks for the temporary password and a new one twice, and SHALL keep every other console page out of reach until the change succeeds, then continue to the page the user was heading to.

#### Scenario: First login of a new user
- **GIVEN** a user created by an administrator
- **WHEN** they log in to the console with the temporary password
- **THEN** the console shows the password change page
- **AND** after a successful change it opens the page they originally requested

### Requirement: Root admin configuration validated at startup
Meet SHALL refuse to start, logging which variable is wrong and exiting with a non-zero status, when `MEET_INITIAL_ADMIN_USER` is shorter than 5 characters, or when no account has that `userId` yet and `MEET_INITIAL_ADMIN_PASSWORD` is shorter than 5 characters. A `MEET_INITIAL_ADMIN_PASSWORD` of any length is accepted when the root admin account already exists.

#### Scenario: Short root admin user ID
- **GIVEN** `MEET_INITIAL_ADMIN_USER` set to `root`
- **WHEN** Meet starts
- **THEN** it logs that `MEET_INITIAL_ADMIN_USER` must be at least 5 characters long and exits with a non-zero status

#### Scenario: Short password on the first start
- **GIVEN** an empty database and `MEET_INITIAL_ADMIN_PASSWORD` set to `1234`
- **WHEN** Meet starts
- **THEN** it logs that `MEET_INITIAL_ADMIN_PASSWORD` must be at least 5 characters long and exits with a non-zero status
- **AND** no root admin account is created

#### Scenario: Short password with an existing root admin
- **GIVEN** a deployment whose root admin account exists
- **WHEN** Meet restarts with `MEET_INITIAL_ADMIN_PASSWORD` set to `1234`
- **THEN** Meet starts and the root admin keeps its password
