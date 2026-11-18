# Spec Delta

## MODIFIED Requirements

### Requirement: The waiting list tells how each participant came

Each `MeetWaitingParticipant` SHALL carry a `type` the server derives from the credential of the request: `user` for a participant who asked with their own Meet account, `identified_guest` for one who asked with their personal member link, `anonymous` for one who asked with a shared link of the room. It SHALL also carry the `role` that credential gave when they asked, kept while that wait lasts, a return to waiting included; their join SHALL take the role their credential gives then. The participants panel SHALL mark each `anonymous` row.

#### Scenario: Shared link

- **GIVEN** a participant who asked to join with the room's anonymous speaker link
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantList`
- **THEN** their entry has `type` `anonymous` and `role` `speaker`, and the panel marks their row

#### Scenario: Account and personal link

- **GIVEN** a user waiting with their own account and an identified guest waiting with their personal link
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantList`
- **THEN** the entries have `type` `user` and `identified_guest`, and the panel marks neither row

#### Scenario: Name chosen by the participant

- **GIVEN** an anonymous participant who typed the name "Dr. Ruiz"
- **WHEN** a moderator looks at the panel
- **THEN** the row reads "Dr. Ruiz" with the "Shared link" marker

#### Scenario: Moderator link

- **GIVEN** a room whose moderator role lacks `accessBypassLock`, and a participant who asked to join with its anonymous moderator link
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantGet` for them
- **THEN** the server answers `200` with `role` `moderator`

#### Scenario: Role changed during the wait

- **GIVEN** an identified guest waiting with `role` `speaker`
- **WHEN** an administrator gives the member the moderator role and a holder of `waitingParticipantAdmin` admits them
- **THEN** their entry kept `role` `speaker` until the admission, and they join the meeting as `moderator`
