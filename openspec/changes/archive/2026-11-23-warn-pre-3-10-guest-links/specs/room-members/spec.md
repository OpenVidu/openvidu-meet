# Spec Delta

## MODIFIED Requirements

### Requirement: Guest links issued before 3.10.0

An identified guest added before 3.10.0 SHALL keep the `accessUrl` it has, whose `secret` is its `memberId`, and that link SHALL keep granting access while the member exists. This form is deprecated and works alongside the current one until 3.13.0, which gives each of those guests a link of the current form, keeping their `memberId`, through its own change. Removing the guest and adding them again SHALL give a link of the current form.

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

## ADDED Requirements

### Requirement: Console marks guest links issued before 3.10.0

For a room the user can manage (an admin or its owner), the console's Room Members tab SHALL show a warning icon next to the name of each identified guest whose `accessUrl` carries their `memberId` as its `secret`. Hovering over it SHALL show a tooltip saying that the link may be insecure and that removing the member and adding them again gives a secure link. Identified guests with a link of the current form and user members SHALL show no such icon.

#### Scenario: Guest added by 3.9

- **GIVEN** a room with an identified guest added by a 3.9 server
- **WHEN** the owner opens the room's Room Members tab and hovers over the warning icon next to the guest's name
- **THEN** a tooltip says that the guest's link may be insecure and that removing the member and adding them again gives a secure link

#### Scenario: Links of the current form

- **GIVEN** a room with an identified guest added by 3.10.0 and a user member
- **WHEN** the owner opens the room's Room Members tab
- **THEN** neither member shows the warning icon
