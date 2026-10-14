# Live Captions Specification

## Purpose

Live captions turn what the participants of a meeting say into text that each participant chooses to read at the bottom of their own meeting view. Operators enable the feature for the deployment, room managers per room, and any participant turns it on for themselves.

Surfaces: internal REST API (`createAiAssistant` and `cancelAiAssistant` at `/internal-api/v1/ai/assistants`, `getCaptionsConfig` at `/internal-api/v1/config/captions`; `meet-ce/backend/openapi/ai-assistants/` and `meet-ce/backend/openapi/config/`), the deployment variable `MEET_CAPTIONS_ENABLED`, the room config field `captions.enabled`, and the captions button of the meeting toolbar. The speech processing agent that produces the text is part of the OpenVidu deployment and is configured outside Meet. Documented in openvidu.io `docs/meet/features/meetings/live-captions.md`.

## Requirements

### Requirement: Deployment switch
Live captions SHALL be available on a deployment only when `MEET_CAPTIONS_ENABLED` is `true`; leaving it unset or giving it any other value keeps them off. `getCaptionsConfig` SHALL report that switch as `enabled` and SHALL answer without any credential.

#### Scenario: Default deployment
- **GIVEN** a deployment that does not set `MEET_CAPTIONS_ENABLED`
- **WHEN** a client without credentials calls `getCaptionsConfig`
- **THEN** the REST API answers `200` with `enabled` set to `false`

#### Scenario: Deployment with captions on
- **GIVEN** a deployment with `MEET_CAPTIONS_ENABLED=true`
- **WHEN** a client without credentials calls `getCaptionsConfig`
- **THEN** the REST API answers `200` with `enabled` set to `true`

### Requirement: Room switch
A room SHALL offer live captions only while its `captions.enabled` is `true`, which is the value a room gets when it is created without one. How the room config is validated and when it may change belongs to `room-config`.

#### Scenario: Room created without a captions setting
- **GIVEN** a `createRoom` request whose config omits `captions`
- **WHEN** the room is created
- **THEN** its `config.captions.enabled` is `true`

#### Scenario: Room created with captions off
- **GIVEN** a `createRoom` request with `config.captions.enabled` set to `false`
- **WHEN** the room is created
- **THEN** its `config.captions.enabled` is `false`

### Requirement: Captions button
The meeting SHALL show the captions button to every participant of a room whose `captions.enabled` is `true`, whatever their permissions, and SHALL NOT show it in a room whose `captions.enabled` is `false`. On a deployment with captions off, the button SHALL be shown disabled, with a note that an administrator disabled live captions.

#### Scenario: Room with captions off
- **GIVEN** a room with `captions.enabled` set to `false`
- **WHEN** a participant joins its meeting
- **THEN** the meeting shows no captions button

#### Scenario: Deployment with captions off
- **GIVEN** a room with `captions.enabled` set to `true` on a deployment without `MEET_CAPTIONS_ENABLED=true`
- **WHEN** a participant joins its meeting
- **THEN** the captions button is shown disabled
- **AND** its label says that live captions are disabled by the administrator

#### Scenario: Captions available
- **GIVEN** a room with `captions.enabled` set to `true` on a deployment with `MEET_CAPTIONS_ENABLED=true`
- **WHEN** a participant without any moderation permission joins its meeting
- **THEN** the captions button is shown enabled

#### Scenario: Narrow window
- **GIVEN** captions available in the room
- **WHEN** the meeting window is narrower than 768 px
- **THEN** the captions control is an entry of the More options menu instead of a toolbar button

### Requirement: Captions are personal
Turning captions on or off SHALL affect only the participant who does it: a participant SHALL see captions only after turning them on themselves, while one shared assistant transcribes the meeting for everyone who did.

#### Scenario: One participant turns captions on
- **GIVEN** participants A and B in a meeting with captions available
- **WHEN** A turns captions on and B speaks
- **THEN** A sees B's words as captions
- **AND** B sees no captions until B turns them on

### Requirement: Starting the room's captions assistant
`createAiAssistant` SHALL start the live captions assistant of the caller's room and answer `201` with its `id` and `status` `active`. A room SHALL have at most one captions assistant: while one is running, the request SHALL count the caller as one more participant using it and answer with the same `id`, without starting another. No permission SHALL be checked beyond the room member token.

#### Scenario: First participant turns captions on
- **GIVEN** a room with captions available and no captions assistant running
- **WHEN** a participant calls `createAiAssistant` with the `live_captions` capability
- **THEN** the REST API answers `201` with an `id` and `status` `active`
- **AND** one captions assistant runs for the room

#### Scenario: Second participant turns captions on
- **GIVEN** a captions assistant already running for the room
- **WHEN** another participant calls `createAiAssistant`
- **THEN** the REST API answers `201` with the `id` of the running assistant
- **AND** no second assistant is started

#### Scenario: Turning captions on again
- **GIVEN** a participant who turned captions on and off, leaving no assistant running
- **WHEN** they call `createAiAssistant` again
- **THEN** a new captions assistant starts for the room

### Requirement: No assistant while captions are disabled
`createAiAssistant` SHALL be rejected, and SHALL start no assistant, when the deployment has captions off or the caller's room has `captions.enabled` set to `false`.

#### Scenario: Deployment with captions off
- **GIVEN** a deployment without `MEET_CAPTIONS_ENABLED=true`
- **WHEN** a participant calls `createAiAssistant`
- **THEN** the request fails with an error
- **AND** no captions assistant is started

#### Scenario: Room with captions off
- **GIVEN** a deployment with captions on and a room with `captions.enabled` set to `false`
- **WHEN** a participant of that room calls `createAiAssistant`
- **THEN** the request fails with an error
- **AND** no captions assistant is started

### Requirement: Request validation
`createAiAssistant` SHALL require a `capabilities` array naming at least one known capability, of which `live_captions` is the only one. Unknown names SHALL be ignored and a repeated name counted once; a body without `capabilities`, with an empty array, with something other than an array, or with no known name SHALL be rejected with `422`. `cancelAiAssistant` SHALL reject a blank `assistantId` with `422`.

#### Scenario: Unknown capability next to a known one
- **GIVEN** a request whose `capabilities` are `live_captions` and an unknown name
- **WHEN** the participant calls `createAiAssistant`
- **THEN** the REST API answers `201` and starts the captions assistant

#### Scenario: Repeated capability
- **GIVEN** a request listing `live_captions` twice
- **WHEN** the participant calls `createAiAssistant`
- **THEN** exactly one captions assistant is started

#### Scenario: Only unknown capabilities
- **GIVEN** a request whose `capabilities` contain only unknown names
- **WHEN** the participant calls `createAiAssistant`
- **THEN** the REST API answers `422`

#### Scenario: Missing or empty capabilities
- **GIVEN** a request without `capabilities`, or with an empty array
- **WHEN** the participant calls `createAiAssistant`
- **THEN** the REST API answers `422`

#### Scenario: Blank assistant id
- **GIVEN** a `cancelAiAssistant` request whose `assistantId` is only whitespace
- **WHEN** the participant sends it
- **THEN** the REST API answers `422`

### Requirement: Room member token required
`createAiAssistant` and `cancelAiAssistant` SHALL accept only a room member token (see `authentication`), and the room they act on SHALL be the token's room. A request without one SHALL be rejected with `401`, a malformed token or a token of a room that no longer exists with `401`, and a room member token that names no participant with `403`.

#### Scenario: No credentials
- **GIVEN** a request without a room member token
- **WHEN** it is sent to `createAiAssistant` or `cancelAiAssistant`
- **THEN** the REST API answers `401`

#### Scenario: Token of a deleted room
- **GIVEN** a room member token whose room was deleted afterwards
- **WHEN** it is used to call `createAiAssistant`
- **THEN** the REST API answers `401`

### Requirement: The assistant stops with its last user
`cancelAiAssistant` SHALL stop counting the caller as a participant using the room's captions assistant and answer `200`, and the assistant SHALL stop only when no participant is left using it. The call SHALL be idempotent and SHALL also answer `200` for a caller who never turned captions on. What is stopped SHALL be the room's current assistant, whatever `assistantId` the path carries.

#### Scenario: Last participant turns captions off
- **GIVEN** a captions assistant used only by participant A
- **WHEN** A calls `cancelAiAssistant`
- **THEN** the REST API answers `200`
- **AND** the captions assistant stops

#### Scenario: Another participant still uses captions
- **GIVEN** a captions assistant used by participants A and B
- **WHEN** A calls `cancelAiAssistant`
- **THEN** the REST API answers `200`
- **AND** the assistant keeps running for B

#### Scenario: Repeated cancel
- **GIVEN** a participant who already turned captions off
- **WHEN** they call `cancelAiAssistant` again
- **THEN** the REST API answers `200`
- **AND** nothing else changes

#### Scenario: Assistant already gone
- **GIVEN** a participant counted as using captions while no assistant runs any more in the room
- **WHEN** they call `cancelAiAssistant`
- **THEN** the REST API answers `200`

### Requirement: Leaving and ending release the assistant
A participant leaving the meeting SHALL count as turning captions off, so the assistant stops when the last participant using it leaves. The end of the meeting SHALL stop the room's captions assistant and forget every participant who was using it.

#### Scenario: Last user leaves
- **GIVEN** a captions assistant used only by participant A
- **WHEN** A leaves the meeting without turning captions off
- **THEN** the captions assistant stops

#### Scenario: Meeting ends
- **GIVEN** a meeting whose captions assistant is used by several participants
- **WHEN** the meeting ends
- **THEN** the captions assistant stops
- **AND** a later meeting in the room starts with nobody using captions

### Requirement: One assistant per room across replicas
Starts and stops of a room's captions assistant SHALL take turns across every Meet replica, so simultaneous starts create exactly one assistant and simultaneous stops stop it once. A start or stop that cannot take its turn within a short retry window SHALL be rejected with `409` and change nothing.

#### Scenario: Two replicas receive a start at once
- **GIVEN** two Meet replicas and a room with no captions assistant
- **WHEN** participant A's `createAiAssistant` reaches one replica and participant B's reaches the other at the same time
- **THEN** both answer `201` with the same `id`
- **AND** exactly one captions assistant runs for the room

#### Scenario: Double click
- **GIVEN** a room with no captions assistant
- **WHEN** the same participant sends two `createAiAssistant` requests at the same time
- **THEN** exactly one captions assistant runs for the room

#### Scenario: Two replicas receive the last stops at once
- **GIVEN** two Meet replicas and a captions assistant used by participants A and B
- **WHEN** A's and B's `cancelAiAssistant` requests reach different replicas at the same time
- **THEN** the assistant is stopped exactly once

### Requirement: Captions display
While a participant has captions on, the meeting SHALL show the captions in a band at the bottom of their view, and the video layout SHALL shrink to leave room for the band instead of being covered by it. Each caption SHALL start with the name of the participant who spoke, in that participant's colour.

#### Scenario: Turning captions on
- **GIVEN** a participant in a meeting with captions available
- **WHEN** they click the captions button
- **THEN** the captions band appears at the bottom of their view
- **AND** the video grid shrinks above it

#### Scenario: Someone speaks
- **GIVEN** a participant with captions on
- **WHEN** another participant speaks
- **THEN** a caption with the speaker's name and their words appears in the band

### Requirement: Caption lifetime
The meeting SHALL show at most the three most recent captions. A caption still being transcribed SHALL be updated in place until its final text arrives; a final caption SHALL disappear 5 seconds after its last update, and an unfinished one 3 seconds after its last update.

#### Scenario: A fourth caption arrives
- **GIVEN** three captions on screen
- **WHEN** a new caption arrives
- **THEN** the oldest one is removed and three captions remain

#### Scenario: Speech settles
- **GIVEN** a caption being transcribed while the participant speaks
- **WHEN** the final text of that speech arrives
- **THEN** the same caption shows the final text
- **AND** it disappears 5 seconds later unless updated

### Requirement: Turning captions off
Turning captions off SHALL remove the band and every caption from the participant's view at once, without waiting for the server. A start the server refuses SHALL leave captions off, and a click on the captions button while a previous click is still being processed SHALL be ignored.

#### Scenario: Turning captions off
- **GIVEN** a participant with captions on
- **WHEN** they click the captions button
- **THEN** the captions band disappears immediately
- **AND** the video grid takes back the whole height

#### Scenario: The server refuses to start
- **GIVEN** a participant whose `createAiAssistant` request fails
- **WHEN** they click the captions button
- **THEN** no captions band appears and the button stays in its off state
