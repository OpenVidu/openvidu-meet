## MODIFIED Requirements

### Requirement: Deployment switch

Live captions SHALL be available on a deployment only when `MEET_CAPTIONS_ENABLED` is `true`; leaving it unset or giving it any other value keeps them off. `configGetCaptions` SHALL report that switch as `enabled` and SHALL answer without any credential.

#### Scenario: Default deployment

- **GIVEN** a deployment that does not set `MEET_CAPTIONS_ENABLED`
- **WHEN** a client without credentials calls `configGetCaptions`
- **THEN** the REST API answers `200` with `enabled` set to `false`

#### Scenario: Deployment with captions on

- **GIVEN** a deployment with `MEET_CAPTIONS_ENABLED=true`
- **WHEN** a client without credentials calls `configGetCaptions`
- **THEN** the REST API answers `200` with `enabled` set to `true`

### Requirement: Room switch

A room SHALL offer live captions only while its `captions.enabled` is `true`, which is the value a room gets when it is created without one. How the room config is validated and when it may change belongs to `room-config`.

#### Scenario: Room created without a captions setting

- **GIVEN** a `roomCreate` request whose config omits `captions`
- **WHEN** the room is created
- **THEN** its `config.captions.enabled` is `true`

#### Scenario: Room created with captions off

- **GIVEN** a `roomCreate` request with `config.captions.enabled` set to `false`
- **WHEN** the room is created
- **THEN** its `config.captions.enabled` is `false`

### Requirement: Starting the room's captions assistant

`aiCreateAssistant` SHALL start the live captions assistant of the caller's room and answer `201` with its `id` and `status` `active`. A room SHALL have at most one captions assistant: while one is running, the request SHALL count the caller as one more participant using it and answer with the same `id`, without starting another. No permission SHALL be checked beyond the room member token.

#### Scenario: First participant turns captions on

- **GIVEN** a room with captions available and no captions assistant running
- **WHEN** a participant calls `aiCreateAssistant` with the `live_captions` capability
- **THEN** the REST API answers `201` with an `id` and `status` `active`
- **AND** one captions assistant runs for the room

#### Scenario: Second participant turns captions on

- **GIVEN** a captions assistant already running for the room
- **WHEN** another participant calls `aiCreateAssistant`
- **THEN** the REST API answers `201` with the `id` of the running assistant
- **AND** no second assistant is started

#### Scenario: Turning captions on again

- **GIVEN** a participant who turned captions on and off, leaving no assistant running
- **WHEN** they call `aiCreateAssistant` again
- **THEN** a new captions assistant starts for the room

### Requirement: No assistant while captions are disabled

`aiCreateAssistant` SHALL be rejected with `403`, and SHALL start no assistant, when the deployment has captions off or the caller's room has `captions.enabled` set to `false`.

#### Scenario: Deployment with captions off

- **GIVEN** a deployment without `MEET_CAPTIONS_ENABLED=true`
- **WHEN** a participant calls `aiCreateAssistant`
- **THEN** the request fails with `403`
- **AND** no captions assistant is started

#### Scenario: Room with captions off

- **GIVEN** a deployment with captions on and a room with `captions.enabled` set to `false`
- **WHEN** a participant of that room calls `aiCreateAssistant`
- **THEN** the request fails with `403`
- **AND** no captions assistant is started

### Requirement: Request validation

`aiCreateAssistant` SHALL require a `capabilities` array naming at least one known capability, of which `live_captions` is the only one. Unknown names SHALL be ignored and a repeated name counted once; a body without `capabilities`, with an empty array, with something other than an array, or with no known name SHALL be rejected with `422`. `aiCancelAssistant` SHALL reject a blank `assistantId` with `422`.

#### Scenario: Unknown capability next to a known one

- **GIVEN** a request whose `capabilities` are `live_captions` and an unknown name
- **WHEN** the participant calls `aiCreateAssistant`
- **THEN** the REST API answers `201` and starts the captions assistant

#### Scenario: Repeated capability

- **GIVEN** a request listing `live_captions` twice
- **WHEN** the participant calls `aiCreateAssistant`
- **THEN** exactly one captions assistant is started

#### Scenario: Only unknown capabilities

- **GIVEN** a request whose `capabilities` contain only unknown names
- **WHEN** the participant calls `aiCreateAssistant`
- **THEN** the REST API answers `422`

#### Scenario: Missing or empty capabilities

- **GIVEN** a request without `capabilities`, or with an empty array
- **WHEN** the participant calls `aiCreateAssistant`
- **THEN** the REST API answers `422`

#### Scenario: Blank assistant id

- **GIVEN** a `aiCancelAssistant` request whose `assistantId` is only whitespace
- **WHEN** the participant sends it
- **THEN** the REST API answers `422`

### Requirement: Room member token required

`aiCreateAssistant` and `aiCancelAssistant` SHALL accept only a room member token (see `authentication`), and the room they act on SHALL be the token's room. A request without one SHALL be rejected with `401`, a malformed token or a token of a room that no longer exists with `401`, and a room member token that names no participant with `403`.

#### Scenario: No credentials

- **GIVEN** a request without a room member token
- **WHEN** it is sent to `aiCreateAssistant` or `aiCancelAssistant`
- **THEN** the REST API answers `401`

#### Scenario: Token of a deleted room

- **GIVEN** a room member token whose room was deleted afterwards
- **WHEN** it is used to call `aiCreateAssistant`
- **THEN** the REST API answers `401`

### Requirement: The assistant stops with its last user

`aiCancelAssistant` SHALL stop counting the caller as a participant using the room's captions assistant and answer `200`, and the assistant SHALL stop only when no participant is left using it. The call SHALL be idempotent and SHALL also answer `200` for a caller who never turned captions on. What is stopped SHALL be the room's current assistant, whatever `assistantId` the path carries.

#### Scenario: Last participant turns captions off

- **GIVEN** a captions assistant used only by participant A
- **WHEN** A calls `aiCancelAssistant`
- **THEN** the REST API answers `200`
- **AND** the captions assistant stops

#### Scenario: Another participant still uses captions

- **GIVEN** a captions assistant used by participants A and B
- **WHEN** A calls `aiCancelAssistant`
- **THEN** the REST API answers `200`
- **AND** the assistant keeps running for B

#### Scenario: Repeated cancel

- **GIVEN** a participant who already turned captions off
- **WHEN** they call `aiCancelAssistant` again
- **THEN** the REST API answers `200`
- **AND** nothing else changes

#### Scenario: Assistant already gone

- **GIVEN** a participant counted as using captions while no assistant runs any more in the room
- **WHEN** they call `aiCancelAssistant`
- **THEN** the REST API answers `200`

### Requirement: One assistant per room across replicas

Starts and stops of a room's captions assistant SHALL take turns across every Meet replica, so simultaneous starts create exactly one assistant and simultaneous stops stop it once. A start or stop that cannot take its turn within a short retry window SHALL be rejected with `409` and change nothing.

#### Scenario: Two replicas receive a start at once

- **GIVEN** two Meet replicas and a room with no captions assistant
- **WHEN** participant A's `aiCreateAssistant` reaches one replica and participant B's reaches the other at the same time
- **THEN** both answer `201` with the same `id`
- **AND** exactly one captions assistant runs for the room

#### Scenario: Double click

- **GIVEN** a room with no captions assistant
- **WHEN** the same participant sends two `aiCreateAssistant` requests at the same time
- **THEN** exactly one captions assistant runs for the room

#### Scenario: Two replicas receive the last stops at once

- **GIVEN** two Meet replicas and a captions assistant used by participants A and B
- **WHEN** A's and B's `aiCancelAssistant` requests reach different replicas at the same time
- **THEN** the assistant is stopped exactly once

### Requirement: Turning captions off

Turning captions off SHALL remove the band and every caption from the participant's view at once, without waiting for the server. A start the server refuses SHALL leave captions off, and a click on the captions button while a previous click is still being processed SHALL be ignored.

#### Scenario: Turning captions off

- **GIVEN** a participant with captions on
- **WHEN** they click the captions button
- **THEN** the captions band disappears immediately
- **AND** the video grid takes back the whole height

#### Scenario: The server refuses to start

- **GIVEN** a participant whose `aiCreateAssistant` request fails
- **WHEN** they click the captions button
- **THEN** no captions band appears and the button stays in its off state

### Requirement: Live captions and end-to-end encryption exclude each other

The server SHALL store `captions.enabled` as `false` whenever the room's `e2ee.enabled` is `true`, both when the room is created and on every config update, so the meeting of an encrypted room never offers live captions. Rooms stored with both enabled before this rule SHALL be turned to captions off when Meet is upgraded.

#### Scenario: Room created with both features enabled

- **WHEN** a room is created with `captions.enabled` and `e2ee.enabled` both `true`
- **THEN** the stored room config has `captions.enabled` set to `false`
- **AND** its meeting shows no captions button

#### Scenario: Encryption enabled later on a room with captions

- **GIVEN** a room with `captions.enabled` set to `true`
- **WHEN** its config is updated with only `e2ee.enabled` set to `true`
- **THEN** the stored room config has `captions.enabled` set to `false`

#### Scenario: Captions re-enabled on an encrypted room

- **GIVEN** a room with `e2ee.enabled` set to `true`
- **WHEN** `roomUpdateConfig` sets only `captions.enabled` to `true`
- **THEN** the server answers `200` and `captions.enabled` stays `false`

#### Scenario: Encrypted room stored before the upgrade

- **GIVEN** a room stored with `e2ee.enabled` and `captions.enabled` both `true` by an earlier Meet version
- **WHEN** Meet is upgraded and its config is read with `roomGetConfig`
- **THEN** `captions.enabled` is `false`
