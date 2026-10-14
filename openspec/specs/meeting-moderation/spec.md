# Meeting Moderation Specification

## Purpose

Lets participants holding moderation permissions, and host applications and backends through the REST and embedded APIs, act on other participants of a live meeting: remove them, turn off their devices and promote them to moderator or demote them back.

Surfaces: REST API (`participantKick`, `participantMute`, `participantMuteAll`, `participantRoleUpdate`; `meet-ce/backend/openapi/meetings/`), webhook `participantRoleChanged` (`meet-ce/backend/openapi/webhooks/`), embedded commands `participantKick` (deprecated alias `kickParticipant`), `participantMute`, `participantMuteAll`, `participantUpdateRole` and event `participantRoleChanged` (`meet-ce/typings/src/embedded/`), permissions `participantKick`, `participantMute`, `participantPromote`, the participants panel of the meeting UI and its notices. Documented in openvidu.io `docs/meet/features/meetings/moderation.md` and `role-management.md`.

## Requirements

### Requirement: Who may moderate
The moderation operations SHALL accept an API key, which acts with every permission, or a room member token for that room holding the operation's permission: `participantKick` to kick, `participantMute` to mute, `participantPromote` to promote or demote. A token for another room or lacking the permission SHALL get 403, a request without credentials 401, and a room that does not exist 404.

#### Scenario: API key
- **GIVEN** a running meeting
- **WHEN** a backend calls `participantKick` with the API key
- **THEN** the participant is kicked

#### Scenario: Token without the permission
- **GIVEN** a room member token for the room without `participantMute`
- **WHEN** it calls `participantMute`
- **THEN** the request answers 403 and nothing is muted

#### Scenario: Unknown room
- **WHEN** a client holding `participantKick` calls `participantKick` for a room that does not exist
- **THEN** the request answers 404

### Requirement: Kick a participant
`DELETE /api/v1/meetings/{roomId}/participants/{participantIdentity}` (`participantKick`) SHALL disconnect that participant from the meeting, whatever their role, and they SHALL leave with reason `participant_kicked` (their own `meetingLeft`, and the `participantLeft` webhook and event). It SHALL answer 404 when the participant is not in the meeting.

#### Scenario: Participant kicked
- **GIVEN** a speaker in a running meeting
- **WHEN** a client holding `participantKick` kicks them
- **THEN** the request answers 200 and the speaker leaves the meeting
- **AND** the `participantLeft` webhook carries `leaveReason` `participant_kicked`

#### Scenario: Participant not in the meeting
- **WHEN** a client kicks an identity that is not in the meeting
- **THEN** the request answers 404

### Requirement: Kick command
The embedded command `participantKick(participantIdentity)`, and its deprecated alias `kickParticipant` until 3.12.0, SHALL kick the given participant on behalf of the local participant, gated by `participantKick` (execution rules in `embedded-api`). The local participant SHALL stay in the meeting.

#### Scenario: Host kicks a speaker
- **GIVEN** an embedded moderator holding `participantKick` and a speaker in the meeting
- **WHEN** the host calls `participantKick` with the speaker's identity
- **THEN** the speaker leaves with reason `participant_kicked`
- **AND** the moderator stays in the meeting

#### Scenario: Deprecated alias
- **WHEN** the host calls `kickParticipant` with a participant identity
- **THEN** the participant is kicked as with `participantKick`

### Requirement: Remove participants from the participants panel
A holder of `participantKick` SHALL find Remove in the row menu of every remote participant who is not a moderator in their own right, and of every participant promoted during the meeting. It SHALL NOT be offered for original moderators, the room owner, administrators or the participant themselves, nor to participants without `participantKick`.

#### Scenario: Remove a speaker
- **GIVEN** a moderator with the participants panel open and a speaker in the meeting
- **WHEN** they choose Remove in the speaker's row menu
- **THEN** the speaker leaves the meeting

#### Scenario: Promoted moderator can be removed
- **GIVEN** a speaker promoted to moderator during the meeting
- **WHEN** another holder of `participantKick` opens that participant's row menu
- **THEN** Remove is offered

#### Scenario: Original moderator is protected
- **GIVEN** an original moderator and a participant promoted during the meeting
- **WHEN** the promoted participant opens the original moderator's row
- **THEN** neither Remove nor Demote is offered

### Requirement: Mute a participant
`PUT /api/v1/meetings/{roomId}/participants/{participantIdentity}/media` (`participantMute`) SHALL turn off, at the media server, the named devices of that participant: microphone, camera, or screen share together with its audio. Only `false` values SHALL be accepted and at least one device SHALL be named, otherwise 422. A named device that is already off SHALL NOT be an error. It SHALL answer 409 for a moderator and 404 when the participant is not in the meeting.

#### Scenario: Turn off microphone and camera
- **GIVEN** a speaker publishing microphone and camera
- **WHEN** a client holding `participantMute` sends `{ "audioActive": false, "videoActive": false }` for them
- **THEN** the request answers 200 and both devices stop publishing

#### Scenario: Turning a device on is rejected
- **WHEN** a client sends `{ "audioActive": true }`
- **THEN** the request answers 422

#### Scenario: No device named
- **WHEN** a client sends an empty body
- **THEN** the request answers 422

#### Scenario: Moderators cannot be muted
- **GIVEN** a participant whose role is moderator
- **WHEN** a client tries to mute them
- **THEN** the request answers 409

#### Scenario: Participant not in the meeting
- **WHEN** a client mutes an identity that is not in the meeting
- **THEN** the request answers 404

### Requirement: Mute everyone
`PUT /api/v1/meetings/{roomId}/participants/media` (`participantMuteAll`) SHALL turn off the named devices of every participant except moderators and the caller, with the same body rules as `participantMute`. It SHALL answer 404 when the room has no meeting running, and SHALL succeed when a participant leaves while it runs.

#### Scenario: Moderators and caller left alone
- **GIVEN** a meeting with the calling speaker holding `participantMute`, another speaker and a moderator, all with microphone on
- **WHEN** the caller mutes everyone's microphone
- **THEN** only the other speaker's microphone is turned off

#### Scenario: No meeting
- **GIVEN** an existing room with no meeting running
- **WHEN** a client calls `participantMuteAll`
- **THEN** the request answers 404

### Requirement: A muted participant is told and keeps control
The meeting of a muted participant SHALL show "A moderator turned off one of your devices", turn the device off on their side so it is not reopened by itself, and let them turn it back on at any time. Moderation SHALL NOT turn any device on nor revoke any `mediaPublish*` permission. Their embedded host sees the change attributed to a moderator (see `meeting-media`).

#### Scenario: Muted speaker turns the microphone back on
- **GIVEN** a speaker whose microphone a moderator turned off
- **WHEN** the speaker turns the microphone on again
- **THEN** their microphone publishes again

#### Scenario: Notice shown
- **WHEN** a moderator turns off a speaker's camera
- **THEN** the speaker sees "A moderator turned off one of your devices"

### Requirement: Only the server can mute a participant
A participant's meeting SHALL act on a moderator mute only when the server sent it. A mute notice published by another participant SHALL be ignored.

#### Scenario: Forged mute from a participant
- **GIVEN** a speaker able to send data messages in the meeting
- **WHEN** they publish a message imitating a moderator mute addressed to everyone
- **THEN** no participant's device is turned off and no mute notice is shown

### Requirement: Mute commands
The embedded commands `participantMute(participantIdentity, media)` and `participantMuteAll(media)` SHALL run `participantMute` and `participantMuteAll` on behalf of the local participant, gated by `participantMute`.

#### Scenario: Host mutes a speaker
- **GIVEN** an embedded moderator and a speaker with microphone on
- **WHEN** the host calls `participantMute` with the speaker's identity and `{ audioActive: false }`
- **THEN** the speaker's microphone is turned off

#### Scenario: Command without the permission
- **GIVEN** an embedded speaker without `participantMute`
- **WHEN** the host calls `participantMute` for another participant
- **THEN** the command is rejected and nothing is muted

### Requirement: Mute controls in the participants panel
The participants panel SHALL show each participant's microphone, camera and screen share state. For a holder of `participantMute`, each live device of a remote participant without a moderator badge SHALL be a button that turns it off, and the panel SHALL offer a "Turn off for everyone" group with screen share, microphone and camera buttons while such a participant is present, each disabled while none of them has that device live.

#### Scenario: Turn off a participant's camera from the panel
- **GIVEN** a holder of `participantMute` with the panel open and a speaker with camera on
- **WHEN** they press the speaker's camera button
- **THEN** the speaker's camera is turned off

#### Scenario: No controls for another moderator
- **GIVEN** a holder of `participantMute` and another moderator in the meeting
- **WHEN** they open the panel
- **THEN** the other moderator's devices cannot be turned off from it

#### Scenario: Group hidden without targets
- **GIVEN** a holder of `participantMute` whose only remote participants are moderators
- **WHEN** they open the panel
- **THEN** no "Turn off for everyone" group is shown

### Requirement: Promote a participant
`PUT /api/v1/meetings/{roomId}/participants/{participantIdentity}/role` (`participantRoleUpdate`) with `action: upgrade` SHALL make a participant whose role is `speaker` a moderator, adding every moderator permission they lack to their own, for the rest of their session: after leaving or reloading they rejoin with their original permissions. Promoting a participant whose role is already moderator (original, promoted, owner or administrator) SHALL answer 409.

#### Scenario: Speaker promoted
- **GIVEN** a speaker in a running meeting
- **WHEN** a client holding `participantPromote` sends `action: upgrade` for them
- **THEN** the request answers 200 and the participant's role becomes moderator

#### Scenario: Already a moderator
- **GIVEN** a participant who joined as moderator
- **WHEN** a client sends `action: upgrade` for them
- **THEN** the request answers 409

#### Scenario: Promotion lost on reload
- **GIVEN** a speaker promoted during the meeting
- **WHEN** they reload the page and join again
- **THEN** they join with their original speaker permissions

### Requirement: Demote a participant
`participantRoleUpdate` with `action: downgrade` SHALL restore the permissions a participant had before being promoted during the meeting. Only participants promoted during the meeting SHALL be demotable; demoting anyone else, original moderators included, SHALL answer 409.

#### Scenario: Promoted participant demoted
- **GIVEN** a speaker promoted during the meeting
- **WHEN** a client holding `participantPromote` sends `action: downgrade` for them
- **THEN** the request answers 200 and they have their original permissions again

#### Scenario: Original moderator cannot be demoted
- **GIVEN** a participant who joined as moderator
- **WHEN** a client sends `action: downgrade` for them
- **THEN** the request answers 409

### Requirement: Role change failures
`participantRoleUpdate` SHALL answer 404 when the participant is not in the meeting, 409 when the participant did not join through Meet, and 422 when `action` is missing or is neither `upgrade` nor `downgrade`.

#### Scenario: Invalid action
- **WHEN** a client sends `action: promote`
- **THEN** the request answers 422

#### Scenario: Participant that did not join through Meet
- **GIVEN** an agent connected to the meeting without Meet's join
- **WHEN** a client sends `action: upgrade` for it
- **THEN** the request answers 409

### Requirement: Role changes of one participant apply one at a time
Role changes of the same participant SHALL apply one after the other across every replica, and also with their token renewals (see `room-members`): of two simultaneous identical promotions one SHALL succeed and the other answer 409, and a change still waiting after about 3 seconds for another one to finish SHALL answer 409.

#### Scenario: Two moderators promote at the same time through two replicas
- **GIVEN** two Meet replicas sharing Redis and a speaker in the meeting
- **WHEN** two moderators promote that speaker at the same time, each request reaching a different replica
- **THEN** one request answers 200 and the other 409
- **AND** exactly one `participantRoleChanged` webhook is sent

### Requirement: A demotion revokes the earlier tokens
A demotion SHALL revoke every room member token issued to the participant before it, as `authentication` specifies, while the participant's meeting renews its token and keeps them in the meeting with the restored permissions. A promotion SHALL NOT revoke any token.

#### Scenario: Demoted participant stays in the meeting
- **GIVEN** a speaker promoted to moderator during the meeting
- **WHEN** a moderator demotes them
- **THEN** they stay in the meeting with their original permissions
- **AND** a `participantKick` call with the room member token they held before the demotion answers 401

#### Scenario: Token from before a promotion
- **GIVEN** a participant promoted during the meeting
- **WHEN** the token they held before the promotion is used
- **THEN** it is still accepted

### Requirement: New permissions take effect in the meeting
After a promotion or demotion, the affected participant's meeting SHALL apply the new permissions without rejoining, both in the interface and at the media server, applying successive changes in the order they happened. When the new permissions cannot be fetched for a transient reason (network failure, 409 or 5xx), the meeting SHALL retry and keep the participant in it; only a 401, 403 or 404 SHALL take them out.

#### Scenario: Promoted participant ends the meeting
- **GIVEN** a speaker who is promoted to moderator
- **WHEN** they are told of the promotion and choose End meeting
- **THEN** the meeting ends

#### Scenario: Server briefly unreachable
- **GIVEN** a speaker being promoted while the server is briefly unreachable from their browser
- **WHEN** the renewal of their permissions fails twice and then succeeds
- **THEN** the participant stays in the meeting and ends up with the moderator permissions

### Requirement: participantRoleChanged webhook
Every promotion and demotion, from the participants panel, the REST API or the embedded command, SHALL be reported once by the `participantRoleChanged` webhook, carrying the participant's live snapshot with the new role (payload shape in `webhooks`). Edits of a member's base role or custom permissions SHALL NOT be reported by it.

#### Scenario: Promotion and demotion reported
- **GIVEN** a registered webhook subscribed to `participantRoleChanged`
- **WHEN** a speaker is promoted and then demoted
- **THEN** two webhooks are delivered, the first with role `moderator` and the second with role `speaker`

#### Scenario: Member edit is not a role change
- **WHEN** an administrator changes the base role of a member who is in the meeting
- **THEN** no `participantRoleChanged` webhook is sent

### Requirement: participantRoleChanged embedded event
The embedded element SHALL dispatch `participantRoleChanged` only to the participant whose role changed, once the new role's permissions are in effect, carrying their live snapshot. A change made while the participant is still joining SHALL be reported after `meetingJoined`. Neither the other participants nor the one who made the change SHALL receive it.

#### Scenario: Only the affected participant is told
- **GIVEN** two embedded participants, a moderator and a speaker
- **WHEN** the moderator promotes the speaker
- **THEN** the speaker's host receives `participantRoleChanged` with role `moderator`
- **AND** the moderator's host receives none

#### Scenario: Promoted while joining
- **GIVEN** an embedded speaker still joining the meeting
- **WHEN** a backend promotes them through the REST API
- **THEN** their host receives `participantRoleChanged` after `meetingJoined`

### Requirement: Role command
The embedded command `participantUpdateRole(participantIdentity, action)` SHALL apply `upgrade` or `downgrade` on behalf of the local participant, gated by `participantPromote`.

#### Scenario: Host promotes a speaker
- **GIVEN** an embedded moderator holding `participantPromote` and a speaker
- **WHEN** the host calls `participantUpdateRole` with the speaker's identity and `upgrade`
- **THEN** the speaker becomes a moderator

#### Scenario: Command without the permission
- **GIVEN** an embedded speaker without `participantPromote`
- **WHEN** the host calls `participantUpdateRole` for another participant
- **THEN** the command is rejected and no role changes

### Requirement: Role notices
The participant promoted or demoted SHALL see "You have been promoted to moderator" or "Your moderator role has been removed" and hear a sound. A newer role change SHALL replace the notice on screen instead of stacking a new one.

#### Scenario: Promotion notice
- **WHEN** a speaker is promoted
- **THEN** they see "You have been promoted to moderator"

#### Scenario: Several changes in a row
- **WHEN** a participant is promoted, demoted and promoted again in quick succession
- **THEN** only the notice of the last change is on screen

### Requirement: Roles in the participants panel
Every participant's panel SHALL mark each participant's role with a badge (owner, administrator or moderator; none for speakers) and update it for everyone when a role changes. A holder of `participantPromote` SHALL find Promote in the row menu of remote participants without a badge and Demote in that of participants promoted during the meeting; original moderators, owners and administrators SHALL offer neither.

#### Scenario: Promote from the panel
- **GIVEN** a holder of `participantPromote` and a speaker in the meeting
- **WHEN** they choose Promote in the speaker's row menu
- **THEN** every participant's panel shows the moderator badge on that participant

#### Scenario: No promotion controls without the permission
- **GIVEN** a participant without `participantPromote`
- **WHEN** they open a speaker's row menu
- **THEN** neither Promote nor Demote is offered
