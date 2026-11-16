## MODIFIED Requirements

### Requirement: User roles
The server SHALL give every user account exactly one user role: `admin`, who administers the whole deployment, `room_manager`, who creates rooms and manages the rooms they own, or `room_member`, who only reaches the rooms they are given access to. What each role may do on rooms, room members and recordings is specified in `rooms`, `room-members` and `permissions`.

#### Scenario: Unknown role rejected
- **GIVEN** an administrator
- **WHEN** they call `userCreate` or `userUpdateRole` with a role other than `admin`, `room_manager` or `room_member`
- **THEN** the server answers `422` naming the `role` field
- **AND** no account is created or changed

### Requirement: Access to user management
The server SHALL accept `userCreate`, `userUpdateRole`, `userResetPassword`, `userDelete` and `userBulkDelete` only with the API key or the access token of an `admin` user, and `userList` and `userGet` also with the access token of a `room_manager` user.

#### Scenario: Room manager reads users
- **GIVEN** a user with role `room_manager`
- **WHEN** they call `userList` or `userGet`
- **THEN** the server answers `200`

#### Scenario: Room manager cannot manage users
- **GIVEN** a user with role `room_manager`
- **WHEN** they call `userCreate`, `userUpdateRole`, `userResetPassword`, `userDelete` or `userBulkDelete`
- **THEN** the server answers `403`

#### Scenario: Room member cannot read users
- **GIVEN** a user with role `room_member`
- **WHEN** they call `userList` or `userGet`
- **THEN** the server answers `403`

#### Scenario: API key manages users
- **GIVEN** a request authenticated with the API key
- **WHEN** it calls any user management operation
- **THEN** the server performs it as the root admin would

### Requirement: Create a user
The server SHALL create an account through `userCreate` with the given `userId`, name, role and initial password, answer `201` with the new user and a `Location` header pointing to `/api/v1/users/{userId}`, and require that user to change the initial password at their first login.

#### Scenario: Account created
- **GIVEN** an administrator
- **WHEN** they call `userCreate` with `userId` `alice_smith`, a name, role `room_manager` and a valid password
- **THEN** the server answers `201` with the user, its `registrationDate` and `roleUpdatedAt`
- **AND** the `Location` header ends in `/api/v1/users/alice_smith`

#### Scenario: First login demands a new password
- **GIVEN** a user just created through `userCreate`
- **WHEN** they log in with the initial password
- **THEN** the login succeeds with `mustChangePassword` set to `true`

### Requirement: User account validation
The server SHALL answer `422`, listing each offending field, to a `userCreate` whose `userId` is not 5 to 20 characters of lowercase letters, digits and underscores, whose name is empty or longer than 50 characters, whose password is shorter than 5 characters, or whose role is missing.

#### Scenario: Uppercase user ID
- **WHEN** an administrator calls `userCreate` with `userId` `Alice_Smith`
- **THEN** the server answers `422` naming `userId`

#### Scenario: Short password
- **WHEN** an administrator calls `userCreate` with a 4-character password
- **THEN** the server answers `422` naming `password`

### Requirement: Unique user IDs
The server SHALL keep `userId` unique across the deployment and answer `409` to a `userCreate` whose `userId` already belongs to an account, including when two creations of the same `userId` reach different replicas at the same time.

#### Scenario: Existing user ID
- **GIVEN** an account with `userId` `alice_smith`
- **WHEN** an administrator calls `userCreate` with `userId` `alice_smith`
- **THEN** the server answers `409`
- **AND** the existing account is unchanged

#### Scenario: Simultaneous creation on two replicas
- **GIVEN** two Meet replicas sharing the same database
- **WHEN** each receives a `userCreate` for `userId` `bob_jones` at the same time
- **THEN** exactly one account `bob_jones` exists afterwards
- **AND** one request answers `201` and the other `409`

### Requirement: No credentials in user responses
The server SHALL never include a password, a password hash or the pending password change state in any user returned by `userCreate`, `userList`, `userGet`, `userUpdateRole` or `userGetMe`.

#### Scenario: Reading a user
- **WHEN** an administrator calls `userGet` for any account
- **THEN** the response carries `userId`, `name`, `registrationDate`, `role` and `roleUpdatedAt`
- **AND** it carries no password data

### Requirement: List users
The server SHALL return users from `userList` one page at a time, sorted by `registrationDate` descending unless `sortField` (`name` or `registrationDate`) and `sortOrder` (`asc` or `desc`) say otherwise, with `maxItems` defaulting to 10, a value above 100 lowered to 100 and echoed in `pagination.maxItems`, and `nextPageToken` continuing the listing.

#### Scenario: Default page
- **GIVEN** 15 accounts
- **WHEN** a caller calls `userList` without parameters
- **THEN** the server answers with the 10 most recently registered users
- **AND** `pagination.isTruncated` is `true` with a `nextPageToken`

#### Scenario: Oversized page
- **WHEN** a caller calls `userList` with `maxItems` 500
- **THEN** the page holds at most 100 users and `pagination.maxItems` is 100

#### Scenario: Invalid paging values
- **WHEN** a caller calls `userList` with `maxItems` 0 or a negative value
- **THEN** the server answers `422`
- **AND** an unreadable `nextPageToken` answers `400`

### Requirement: Filter users
The server SHALL narrow `userList` by `role`, by exact `userId`, and by `name` matched as `nameMatchMode` says (`exact` by default, `prefix`, `partial` or `regex`), case-sensitively unless `nameCaseInsensitive` is `true`. When both `userId` and `name` are given, a user matching either one is returned. Every page SHALL apply the same filters as the first.

#### Scenario: Partial name match
- **GIVEN** users named `Alice Smith` and `Bob Smith`
- **WHEN** a caller calls `userList` with `name` `smith`, `nameMatchMode` `partial` and `nameCaseInsensitive` `true`
- **THEN** both users are returned

#### Scenario: Search by user ID or name
- **GIVEN** a user `alice_smith` named `Alice` and a user `bob_jones` named `alice`
- **WHEN** a caller calls `userList` with `userId` `alice_smith`, `name` `alice` and `nameMatchMode` `prefix`
- **THEN** both users are returned

#### Scenario: Search by user ID or name across pages
- **GIVEN** a user `alice_smith`, a user named `Bob` and other users registered before them
- **WHEN** a caller pages through `userList` with `userId` `alice_smith`, `name` `Bob`, `nameMatchMode` `prefix` and `maxItems` 1
- **THEN** the pages together hold those two users only

#### Scenario: Invalid regular expression
- **WHEN** a caller calls `userList` with `nameMatchMode` `regex` and a `name` that is not a valid regular expression or is longer than 100 characters
- **THEN** the server answers `422` naming `name`

### Requirement: Get a user
The server SHALL return the account identified by `userId` from `userGet`, and answer `404` when no account has that `userId`.

#### Scenario: Unknown user
- **WHEN** a caller calls `userGet` for a `userId` that does not exist
- **THEN** the server answers `404`

### Requirement: Own account
The server SHALL return the account of the caller from `userGetMe` for a user of any role, accepting only an access token (not the API key), also while the user has a password change pending.

#### Scenario: Room member reads their account
- **GIVEN** a logged-in user with role `room_member`
- **WHEN** they call `userGetMe`
- **THEN** the server answers `200` with their own account

#### Scenario: API key alone
- **WHEN** a request carrying only the API key calls `userGetMe`
- **THEN** the server answers `401`

### Requirement: Change own password
The server SHALL let any logged-in user replace their password through `userChangePassword` by giving the current one, answer `400` when the current password is wrong and `422` when the new one is shorter than 5 characters, and accept only the new password at later logins. A successful change SHALL answer `200` with a new `accessToken` and `refreshToken` and SHALL reject, on every replica, every access token and refresh token issued to the user before it.

#### Scenario: Password changed
- **GIVEN** a logged-in user without a pending password change
- **WHEN** they call `userChangePassword` with their current password and a new valid one
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
- **WHEN** a user calls `userChangePassword` with a wrong current password
- **THEN** the server answers `400` and the password is unchanged

### Requirement: Forced password change
The server SHALL keep an account created by `userCreate` or reset by `userResetPassword` in a pending password change state until its user calls `userChangePassword`. While pending, the user's access tokens reach only `userGetMe` and `userChangePassword` (every other endpoint that takes an access token answers `403` saying a password change is required), and completing the change returns a new access token and refresh token.

#### Scenario: Pending user blocked elsewhere
- **GIVEN** a user with a pending password change who has logged in
- **WHEN** they call `roomList` or any other endpoint that takes an access token, except `userGetMe` and `userChangePassword`
- **THEN** the server answers `403` saying a password change is required

#### Scenario: Completing the change
- **GIVEN** a user with a pending password change who has logged in
- **WHEN** they call `userChangePassword` with the temporary password and a new one
- **THEN** the server answers `200` with an `accessToken` and a `refreshToken`
- **AND** with those tokens the user reaches every endpoint their role allows

### Requirement: Reset another user's password
The server SHALL let an administrator set a new password for another account through `userResetPassword`, putting that account in the pending password change state, and answer `404` when the `userId` does not exist.

#### Scenario: Password reset
- **GIVEN** a user `bob_jones` who is logged in elsewhere
- **WHEN** an administrator calls `userResetPassword` for `bob_jones` with a new password
- **THEN** the server answers `200`
- **AND** `bob_jones` logs in with the new password and is asked to change it
- **AND** the tokens `bob_jones` held before reach only `userGetMe` and `userChangePassword`

#### Scenario: Unknown user
- **WHEN** an administrator calls `userResetPassword` for a `userId` that does not exist
- **THEN** the server answers `404`

### Requirement: Update a user's role
The server SHALL change the role of an account through `userUpdateRole` and answer `200` with the updated user, `404` when the `userId` does not exist, and `200` with the account unchanged when the requested role is the current one. A role change takes effect at once on the user's existing tokens, as specified in `authentication`.

#### Scenario: Role changed
- **GIVEN** a user with role `room_member`
- **WHEN** an administrator calls `userUpdateRole` with role `room_manager`
- **THEN** the server answers `200` with role `room_manager` and a newer `roleUpdatedAt`

#### Scenario: Same role
- **GIVEN** a user with role `room_manager`
- **WHEN** an administrator calls `userUpdateRole` with role `room_manager`
- **THEN** the server answers `200` with `roleUpdatedAt` unchanged
- **AND** the tokens the user holds stay valid

### Requirement: Delete a user
The server SHALL delete an account through `userDelete`, answering `200`, or `404` when the `userId` does not exist. Deleting a user removes them from every meeting they are in, removes all their room memberships, and hands every room they own over to the root admin, each room keeping its recordings.

#### Scenario: Owner deleted
- **GIVEN** a `room_manager` who owns a room, is a member of another and is in a meeting
- **WHEN** an administrator calls `userDelete` for them
- **THEN** the server answers `200`
- **AND** they are removed from the meeting
- **AND** the owned room belongs to the root admin and keeps its recordings
- **AND** the other room no longer lists them as a member

#### Scenario: Unknown user
- **WHEN** an administrator calls `userDelete` for a `userId` that does not exist
- **THEN** the server answers `404`

### Requirement: Bulk delete users
The server SHALL delete every account listed in the comma-separated `userIds` of `userBulkDelete` that can be deleted, with the same effects as `userDelete`, and answer `200` with the `deleted` list and an empty `failed` list when all were deleted, or `400` with `deleted` and a `failed` entry (`userId` and `error`) for each root admin, own account or unknown `userId`. An empty `userIds` answers `422`.

#### Scenario: Mixed result
- **GIVEN** two existing users and one unknown `userId`
- **WHEN** an administrator calls `userBulkDelete` with those three IDs and the root admin's
- **THEN** the server answers `400`
- **AND** `deleted` lists the two existing users, who are gone
- **AND** `failed` lists the unknown `userId` with `User not found` and the root admin with `Cannot delete the root admin user`

#### Scenario: Empty list
- **WHEN** an administrator calls `userBulkDelete` with an empty `userIds`
- **THEN** the server answers `422`

### Requirement: Concurrent changes to the same user
The server SHALL answer `404`, never `500`, to an operation on a user that a concurrent request deleted, on whichever replica each request runs, and a bulk deletion SHALL report as deleted the users a concurrent request removed first.

#### Scenario: Two replicas delete the same user
- **GIVEN** two Meet replicas sharing the same database and an account `carol_lee`
- **WHEN** both receive `userDelete` for `carol_lee` at the same time
- **THEN** one answers `200` and the other `404`

#### Scenario: Reset of a vanishing user
- **GIVEN** an account being deleted by another request
- **WHEN** an administrator calls `userResetPassword` for it and the deletion lands first
- **THEN** the server answers `404`

### Requirement: Root admin protection
The server SHALL answer `403` to `userDelete`, `userUpdateRole` and `userResetPassword` targeting the root admin, the account whose `userId` equals `MEET_INITIAL_ADMIN_USER`. The root admin changes its own password through `userChangePassword`.

#### Scenario: Deleting the root admin
- **WHEN** an administrator calls `userDelete` for the root admin
- **THEN** the server answers `403` and the account remains

#### Scenario: Demoting the root admin
- **WHEN** an administrator calls `userUpdateRole` for the root admin
- **THEN** the server answers `403` and its role stays `admin`

#### Scenario: Resetting the root admin password
- **WHEN** an administrator calls `userResetPassword` for the root admin
- **THEN** the server answers `403`

### Requirement: Own account protection
The server SHALL answer `403` when an administrator calls `userDelete`, `userUpdateRole` or `userResetPassword` on their own account; they change their own password through `userChangePassword` and need another administrator for the rest.

#### Scenario: Deleting oneself
- **GIVEN** a logged-in `admin` user
- **WHEN** they call `userDelete` with their own `userId`
- **THEN** the server answers `403`

#### Scenario: Changing one's own role
- **GIVEN** a logged-in `admin` user
- **WHEN** they call `userUpdateRole` on their own account
- **THEN** the server answers `403`

### Requirement: Root admin identified in user responses
The server SHALL include `isRootAdmin` in every user returned by `userCreate`, `userList`, `userGet`, `userUpdateRole` and `userGetMe`, `true` for the account whose `userId` equals `MEET_INITIAL_ADMIN_USER` and `false` for every other account.

#### Scenario: Reading the root admin
- **GIVEN** default configuration
- **WHEN** an administrator calls `userGet` for `admin`
- **THEN** the response carries `isRootAdmin` `true`

#### Scenario: Root admin user ID changed
- **GIVEN** a deployment whose root admin was `admin` and that restarted with `MEET_INITIAL_ADMIN_USER` set to `root_admin`
- **WHEN** an administrator calls `userList`
- **THEN** `root_admin` carries `isRootAdmin` `true`
- **AND** `admin` carries `isRootAdmin` `false`
