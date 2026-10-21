## MODIFIED Requirements

### Requirement: Effective permissions
The server SHALL compute a member's `effectivePermissions` as the permission set of its base role in the room (see `room-access`) with every key of `customPermissions` overriding the role's value, and SHALL set `permissionsUpdatedAt` when it first computes them and each time they change; an `updateRoomMember` that leaves them as they were SHALL NOT advance it.

#### Scenario: Override on top of the role
- **GIVEN** a room whose speaker role denies `recordingControl` and grants `mediaShareScreen`
- **WHEN** a manager adds a member with `baseRole` `speaker` and `customPermissions` granting `recordingControl` and denying `mediaShareScreen`
- **THEN** the member's `effectivePermissions` grant `recordingControl`, deny `mediaShareScreen` and match the speaker role for every other key

#### Scenario: No overrides
- **WHEN** a manager adds a member with `baseRole` `moderator` and no `customPermissions`
- **THEN** the member's `effectivePermissions` equal the room's moderator role permissions

#### Scenario: Update without effect
- **GIVEN** a speaker member without overrides in a room whose speaker role grants `chatWrite`
- **WHEN** a manager calls `updateRoomMember` with `customPermissions` granting `chatWrite`
- **THEN** the member's `customPermissions` hold `chatWrite` and its `permissionsUpdatedAt` is unchanged

### Requirement: Updating a member
`updateRoomMember` SHALL change the member's `baseRole`, its `customPermissions`, or both, recompute its `effectivePermissions` and answer `200` with the member; a `customPermissions` object SHALL replace the previous overrides as a whole, so an override it leaves out falls back to the base role. When the `effectivePermissions` change, the member's earlier room member tokens stop being accepted (see `authentication`); otherwise they stay valid.

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
- **GIVEN** an identified guest taking part in the room's meeting
- **WHEN** a manager calls `updateRoomMember` with an empty body
- **THEN** the server answers `200` and the member keeps its role and overrides
- **AND** the room member tokens issued to the member before the call are still accepted
- **AND** the guest gets no notice that their permissions were updated

#### Scenario: Unknown member
- **WHEN** a manager updates a member that does not exist in the room
- **THEN** the server answers `404`

### Requirement: Permission changes reach a member in the meeting
When an update changes the `effectivePermissions` of a member who is in the room's meeting and keeps `meetingJoin`, the server SHALL ask that participant's client to renew its room member token, and the meeting SHALL then apply the new permissions without the participant leaving and show them a notice that their permissions were updated. Failing to deliver that request SHALL NOT fail the update.

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
