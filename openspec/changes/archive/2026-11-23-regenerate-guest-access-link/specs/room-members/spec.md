# Spec Delta

## ADDED Requirements

### Requirement: Regenerating an identified guest's link

`roomRegenerateMemberAccessUrl` SHALL give an identified guest a new `accessUrl` of the current form: the room URL carrying as its `secret` the same `memberId`, a hyphen and new random characters. From then on the previous link SHALL grant no access, admission from the waiting room included. The member's identity, base role, permissions and membership date SHALL NOT change, and the tokens already issued SHALL stay valid. A user member SHALL give `409`, and an unknown member or room `404`.

#### Scenario: New link

- **GIVEN** an identified guest of room `room-123`
- **WHEN** the owner calls `roomRegenerateMemberAccessUrl` for that guest
- **THEN** the server answers `200` with the member, whose `memberId`, `baseRole`, `customPermissions` and `membershipDate` are unchanged and which carries no `effectivePermissions`
- **AND** its `accessUrl` ends with `/room/room-123?secret=` followed by the `memberId`, a `-` and random characters other than those of the previous link

#### Scenario: The previous link stops working

- **GIVEN** an identified guest whose link was regenerated
- **WHEN** a client calls `roomGenerateMemberToken` with the `secret` of the previous link
- **THEN** the server answers `404`
- **AND** the same call with the `secret` of the new link answers `200` with a token bound to that member

#### Scenario: Guest added by 3.9

- **GIVEN** an identified guest added by a 3.9 server, whose `accessUrl` carries their `memberId` as its `secret`
- **WHEN** the owner regenerates the guest's link
- **THEN** the new `accessUrl` carries the same `memberId`, a `-` and random characters
- **AND** a token requested with the `memberId` alone as `secret` is refused with `404`

#### Scenario: Guest in the meeting

- **GIVEN** an identified guest taking part in the room's meeting
- **WHEN** the owner regenerates the guest's link
- **THEN** the guest stays in the meeting
- **AND** the room member token they joined with is still accepted

#### Scenario: Guest waiting to be let in

- **GIVEN** an identified guest waiting to be let in to the room's locked meeting with their link
- **WHEN** the owner regenerates the guest's link and a moderator admits them
- **THEN** the guest gets no join token and the meeting shows them the "Invalid member" screen

#### Scenario: User member

- **GIVEN** a user member of the room
- **WHEN** the owner calls `roomRegenerateMemberAccessUrl` for that member
- **THEN** the server answers `409` and the member's `accessUrl` is unchanged

#### Scenario: Unknown member

- **WHEN** the owner calls `roomRegenerateMemberAccessUrl` for a `memberId` that is not a member of the room
- **THEN** the server answers `404`

#### Scenario: Room does not exist

- **WHEN** an admin calls `roomRegenerateMemberAccessUrl` on a room that does not exist
- **THEN** the server answers `404`

### Requirement: Who regenerates a guest's link

The server SHALL allow `roomRegenerateMemberAccessUrl` only with the access token of an admin or of the room's owner. It SHALL answer `401` to a request without that credential, an API key or a room member token included, and `403` to any other user, including members of the room.

#### Scenario: Admin

- **WHEN** an admin regenerates the link of an identified guest of a room they do not own
- **THEN** the server answers `200`

#### Scenario: API key

- **WHEN** a client calls `roomRegenerateMemberAccessUrl` with only an API key
- **THEN** the server answers `401`

#### Scenario: Manager who is only a member

- **GIVEN** a `room_manager` who is a member, not the owner, of a room
- **WHEN** they call `roomRegenerateMemberAccessUrl` on that room
- **THEN** the server answers `403`

### Requirement: Console regenerates a guest's link

For a room the user can manage (an admin or its owner), the console's Room Members tab SHALL offer on each identified guest an action to regenerate their link. It SHALL ask for confirmation, saying that the current link stops working and that the guest stays in the meeting if they are in it until they leave it, and once confirmed SHALL show the new link with a way to copy it. User members SHALL NOT offer the action.

#### Scenario: Regenerate and copy

- **GIVEN** the Room Members tab of a room with an identified guest
- **WHEN** the owner regenerates the guest's link, confirms and copies the link shown
- **THEN** the clipboard holds the guest's new `accessUrl`, which differs from the previous one

#### Scenario: Cancelled

- **GIVEN** the Room Members tab of a room with an identified guest
- **WHEN** the owner starts regenerating the guest's link and cancels the confirmation
- **THEN** the guest's `accessUrl` is unchanged

#### Scenario: User member

- **GIVEN** the Room Members tab of a room with a user member
- **WHEN** the owner looks at that member's actions
- **THEN** no regenerate link action is offered

## MODIFIED Requirements

### Requirement: Identified guest members

An identified guest SHALL get a generated `memberId` that starts with `guest-`, and an `accessUrl` that is the room URL carrying as its `secret` that `memberId`, a hyphen and random characters: a personal link that grants access to the room without any login while the member exists and until the link is regenerated (see "Regenerating an identified guest's link"). `roomUpdateMember` SHALL keep the same `accessUrl`.

#### Scenario: Personal access link

- **WHEN** a manager adds an identified guest to room `room-123`
- **THEN** the member's `memberId` starts with `guest-`
- **AND** its `accessUrl` ends with `/room/room-123?secret=` followed by the `memberId`, a `-` and random characters

#### Scenario: Two guests get unrelated links

- **WHEN** a manager adds two identified guests to the same room
- **THEN** the two `accessUrl` values carry different random parts

#### Scenario: Update keeps the link

- **GIVEN** an identified guest of the room
- **WHEN** a manager changes the guest's `baseRole` with `roomUpdateMember`
- **THEN** the guest's `accessUrl` is the same as before the update

### Requirement: Guest links issued before 3.10.0

An identified guest added before 3.10.0 SHALL keep the `accessUrl` it has, whose `secret` is its `memberId`, and that link SHALL keep granting access while the member exists. This form is deprecated and works alongside the current one until 3.13.0, which gives each of those guests a link of the current form, keeping their `memberId`, through its own change. Regenerating the guest's link, or removing the guest and adding them again, SHALL give a link of the current form.

#### Scenario: Guest added by 3.9 after the upgrade

- **GIVEN** an identified guest added by a 3.9 server, whose `accessUrl` carries their `memberId`
- **WHEN** the server runs 3.10.0 and a client calls `roomGenerateMemberToken` with that `secret`
- **THEN** the server answers `200` with a token bound to that member
- **AND** a manager reading the member gets the same `accessUrl` as before the upgrade

#### Scenario: Re-adding a guest closes the old link

- **GIVEN** an identified guest added by a 3.9 server
- **WHEN** a manager removes the guest and adds them again
- **THEN** the new member's `accessUrl` carries their new `memberId`, a `-` and random characters
- **AND** a token requested with the old link's `secret` is refused with `404`

### Requirement: Console marks guest links issued before 3.10.0

For a room the user can manage (an admin or its owner), the console's Room Members tab SHALL show a warning icon next to the name of each identified guest whose `accessUrl` carries their `memberId` as its `secret`. Hovering over it SHALL show a tooltip saying that the link may be insecure and that clicking the icon regenerates it, and clicking it, or pressing Enter on it, SHALL start the same regenerate action as the guest's regenerate button. Identified guests with a link of the current form and user members SHALL show no such icon.

#### Scenario: Guest added by 3.9

- **GIVEN** a room with an identified guest added by a 3.9 server
- **WHEN** the owner opens the room's Room Members tab and hovers over the warning icon next to the guest's name
- **THEN** a tooltip says that the guest's link may be insecure and that clicking the icon regenerates it

#### Scenario: Clicking the icon

- **GIVEN** a room with an identified guest added by a 3.9 server
- **WHEN** the owner clicks the warning icon next to the guest's name and confirms
- **THEN** the console shows the guest's new link and the guest no longer shows the warning icon

#### Scenario: Links of the current form

- **GIVEN** a room with an identified guest added by 3.10.0 and a user member
- **WHEN** the owner opens the room's Room Members tab
- **THEN** neither member shows the warning icon

### Requirement: Console Room Members tab

For a room the user can manage (an admin or its owner), the console room detail page SHALL show a Room Members tab listing each member's name, base role and type, with a name search (prefix match by default), filters by base role and type, sorting, loading of further pages, and actions to add a member, delete a selection of members, and, on each member's row, copy its access link and edit it, with a more options menu to regenerate an identified guest's link and to delete the member.

#### Scenario: Copy an identified guest's link

- **GIVEN** the Room Members tab of a room with an identified guest
- **WHEN** the owner copies that member's access link
- **THEN** the clipboard holds the guest's personal `accessUrl`

#### Scenario: Row actions

- **GIVEN** the Room Members tab of a room with an identified guest
- **WHEN** the owner looks at the guest's row
- **THEN** it offers three buttons, copy link, edit and more options
- **AND** the more options menu offers to regenerate the guest's link and to remove the guest

#### Scenario: Not a manager

- **GIVEN** a user who is a member, not the owner, of a room
- **WHEN** they open the room detail page
- **THEN** no Room Members tab is shown
