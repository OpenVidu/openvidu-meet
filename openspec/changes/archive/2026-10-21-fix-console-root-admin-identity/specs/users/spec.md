## ADDED Requirements

### Requirement: Root admin identified in user responses
The server SHALL include `isRootAdmin` in every user returned by `createUser`, `getUsers`, `getUser`, `updateUserRole` and `getMe`, `true` for the account whose `userId` equals `MEET_INITIAL_ADMIN_USER` and `false` for every other account.

#### Scenario: Reading the root admin
- **GIVEN** default configuration
- **WHEN** an administrator calls `getUser` for `admin`
- **THEN** the response carries `isRootAdmin` `true`

#### Scenario: Root admin user ID changed
- **GIVEN** a deployment whose root admin was `admin` and that restarted with `MEET_INITIAL_ADMIN_USER` set to `root_admin`
- **WHEN** an administrator calls `getUsers`
- **THEN** `root_admin` carries `isRootAdmin` `true`
- **AND** `admin` carries `isRootAdmin` `false`

## MODIFIED Requirements

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

#### Scenario: Root admin registered after other users
- **GIVEN** a deployment that restarted with `MEET_INITIAL_ADMIN_USER` changed from `admin` to `root_admin`
- **WHEN** another administrator opens the Users page
- **THEN** the `root_admin` row is marked as the root admin and protected
- **AND** the `admin` row can be selected and offers role change, password reset and delete
