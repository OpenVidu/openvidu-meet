## MODIFIED Requirements

### Requirement: Identified guest members
An identified guest SHALL get a generated `memberId` that starts with `guest-`, and an `accessUrl` that is the room URL carrying as its `secret` that `memberId`, a hyphen and random characters: a personal link that grants access to the room without any login while the member exists. Updating the member SHALL keep the same `accessUrl`.

#### Scenario: Personal access link
- **WHEN** a manager adds an identified guest to room `room-123`
- **THEN** the member's `memberId` starts with `guest-`
- **AND** its `accessUrl` ends with `/room/room-123?secret=` followed by the `memberId`, a `-` and random characters

#### Scenario: Two guests get unrelated links
- **WHEN** a manager adds two identified guests to the same room
- **THEN** the two `accessUrl` values carry different random parts

#### Scenario: Update keeps the link
- **GIVEN** an identified guest of the room
- **WHEN** a manager changes the guest's `baseRole` with `updateRoomMember`
- **THEN** the guest's `accessUrl` is the same as before the update

### Requirement: Secrets that authenticate
A `secret` SHALL be either one of the room's anonymous access secrets (see `room-access`) or exactly the secret stored in the `accessUrl` of an identified guest of the room, which authenticates as that guest. A `guest-` secret that is not the stored secret of a guest's link of the room SHALL give `404`, and any other secret the room does not recognize `400`.

#### Scenario: Identified guest link
- **GIVEN** an identified guest of the room
- **WHEN** a client calls `generateRoomMemberToken` with `secret` set to the secret of that guest's `accessUrl`
- **THEN** the server answers `200` with a token bound to that member

#### Scenario: A member id does not authenticate
- **GIVEN** an identified guest whose `baseRole` is `moderator`, added by 3.10.0 and taking part in the room's meeting
- **AND** another participant who reads that guest's `participantIdentity` from the participant list
- **WHEN** that participant calls `generateRoomMemberToken` with `secret` set to that identity
- **THEN** the server answers `404` and issues no token

#### Scenario: Wrong random part
- **GIVEN** an identified guest added by 3.10.0
- **WHEN** a client sends as `secret` the guest's `memberId`, a `-` and random characters other than those of the guest's link
- **THEN** the server answers `404` with the same response as for a guest that does not exist

#### Scenario: Unknown guest
- **WHEN** a client sends `secret` `guest-nonexistent`
- **THEN** the server answers `404` saying the room member was not found

#### Scenario: Guest link of another room
- **GIVEN** an identified guest of room A
- **WHEN** a client calls `generateRoomMemberToken` for room B with the secret of that guest's `accessUrl`
- **THEN** the server answers `404`

#### Scenario: Unrecognized secret
- **WHEN** a client sends a `secret` that matches no access link of the room
- **THEN** the server answers `400`

## ADDED Requirements

### Requirement: Guest links issued before 3.10.0
An identified guest added before 3.10.0 SHALL keep the `accessUrl` it has, whose `secret` is its `memberId`, and that link SHALL keep granting access while the member exists. This form is deprecated and works alongside the current one until 3.13.0, which replaces it through its own change. Removing the guest and adding them again SHALL give a link of the current form.

#### Scenario: Guest added by 3.9 after the upgrade
- **GIVEN** an identified guest added by a 3.9 server, whose `accessUrl` carries their `memberId`
- **WHEN** the server runs 3.10.0 and a client calls `generateRoomMemberToken` with that `secret`
- **THEN** the server answers `200` with a token bound to that member
- **AND** a manager reading the member gets the same `accessUrl` as before the upgrade

#### Scenario: Re-adding a guest closes the old link
- **GIVEN** an identified guest added by a 3.9 server
- **WHEN** a manager removes the guest and adds them again
- **THEN** the new member's `accessUrl` carries their new `memberId`, a `-` and random characters
- **AND** a token requested with the old link's `secret` is refused with `404`
