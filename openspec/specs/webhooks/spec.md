# Webhooks Specification

## Purpose

Webhooks let an integrator's backend learn what happens in Meet (meetings, participants, recordings) through signed HTTP notifications instead of polling. This capability holds the registry of webhook endpoints and the delivery rules shared by every event; when each event fires, and what its payload means, belongs to the feature that owns it.

Surfaces: REST API (`webhookCreate`, `webhookList`, `webhookGet`, `webhookUpdate`, `webhookDelete`, `webhookTest`; `meet-ce/backend/openapi/webhooks/`), outgoing deliveries (the `MeetWebhookEvent` envelope and the per-event payloads, `meet-ce/backend/openapi/webhooks/webhooks.yaml` and typings `meet-ce/typings/src/webhook.ts`), the webhooks section of the console Embedded page, and the configuration variables `MEET_INITIAL_WEBHOOK_URL` and `MEET_INITIAL_WEBHOOK_ENABLED`. Documented in openvidu.io `docs/meet/embedded/reference/webhooks.md` and `docs/meet/embedded/tutorials/advanced-features/webhooks.md`.

## Requirements

### Requirement: Webhook management requires an API key or an administrator
The REST API SHALL accept `webhookCreate`, `webhookList`, `webhookGet`, `webhookUpdate`, `webhookDelete` and `webhookTest` only with the deployment's API key (`X-API-KEY`) or with the access token of a user whose role is `admin`. A room member token grants no access to webhooks.

#### Scenario: Request without credentials
- **WHEN** a client calls `webhookList` without any credential
- **THEN** the REST API answers `401`

#### Scenario: Request with only a room member token
- **GIVEN** a valid room member token of any room, with every permission
- **WHEN** a client calls `webhookCreate` sending only that token
- **THEN** the REST API answers `401`

#### Scenario: Request from a user who is not an administrator
- **GIVEN** a user whose role is `room_manager`
- **WHEN** that user calls `webhookList` with their access token
- **THEN** the REST API answers `403`

#### Scenario: Request with the API key or an administrator token
- **WHEN** a client calls `webhookList` with the deployment's API key, or with the access token of an `admin` user
- **THEN** the REST API answers `200` with every registered webhook

### Requirement: Registering a webhook
The REST API SHALL register a webhook through `webhookCreate`, answer `201` with the stored webhook and a `Location` header pointing at it, and assign it an identifier starting with `wh-` and its `creationDate`. An omitted `enabled` SHALL default to `true`, an omitted `events` SHALL mean every event type, and an omitted `roomId` SHALL mean every room.

#### Scenario: Register with only a URL
- **WHEN** an administrator calls `webhookCreate` with only `url: "https://example.com/hook"`
- **THEN** the REST API answers `201` with a `webhookId` starting with `wh-`, `enabled: true` and no `events` nor `roomId`
- **AND** the `Location` header ends with `/api/v1/webhooks/{webhookId}`

#### Scenario: Register with an event filter, a room scope and paused
- **WHEN** an administrator calls `webhookCreate` with `events: ["participantJoined", "participantLeft"]`, `roomId: "room-123"` and `enabled: false`
- **THEN** the REST API answers `201` and the stored webhook keeps those three values

### Requirement: Webhook definitions are validated
The REST API SHALL reject with `422` a webhook definition, on create or update, whose `url` is missing or does not start with `http://` or `https://`, whose `events` is an empty list or contains a value outside the webhook event catalogue, or whose `roomId` is blank.

#### Scenario: Non-HTTP URL
- **WHEN** an administrator calls `webhookCreate` with `url: "ftp://example.com/hook"`
- **THEN** the REST API answers `422` and registers nothing

#### Scenario: Empty event filter
- **WHEN** an administrator calls `webhookCreate` with a valid URL and `events: []`
- **THEN** the REST API answers `422`, since omitting `events` is how every event type is selected

#### Scenario: Unknown event type
- **WHEN** an administrator calls `webhookUpdate` with `events: ["testEvent"]`
- **THEN** the REST API answers `422`

### Requirement: The room scope is an opaque filter
The server SHALL store a webhook's `roomId` without checking that the room exists, SHALL deliver to that webhook only events of the room with that identifier, and SHALL NOT remove or change the webhook when that room is deleted.

#### Scenario: Room that does not exist
- **GIVEN** no room with identifier `room-123` exists
- **WHEN** an administrator registers a webhook with `roomId: "room-123"`
- **THEN** the REST API answers `201`
- **AND** the webhook receives no event of any other room

#### Scenario: Room deleted
- **GIVEN** a webhook scoped to `room-123`
- **WHEN** room `room-123` is deleted
- **THEN** the webhook stays registered, unchanged, and receives no further events

### Requirement: At most ten webhooks per deployment
The REST API SHALL keep at most 10 registered webhooks per deployment and SHALL answer `409` to a `webhookCreate` that would exceed that limit. Registrations SHALL be serialized across every replica, so concurrent registrations never exceed the limit; a registration that cannot take its turn after a short wait SHALL answer `409` asking the client to retry.

#### Scenario: Limit reached
- **GIVEN** 10 webhooks are registered
- **WHEN** an administrator calls `webhookCreate`
- **THEN** the REST API answers `409` with a message stating the maximum number of webhooks has been reached

#### Scenario: Two replicas register the last free slot at the same time
- **GIVEN** a deployment with two Meet replicas and 9 registered webhooks
- **WHEN** one `webhookCreate` reaches the first replica and another reaches the second replica at the same moment
- **THEN** exactly one of them answers `201`
- **AND** the other answers `409`, and the deployment ends with 10 webhooks

### Requirement: Reading registered webhooks
The REST API SHALL return every registered webhook, enabled or not, through `webhookList` without pagination, and a single webhook through `webhookGet`, answering `404` when the identifier does not exist.

#### Scenario: List every webhook
- **GIVEN** two registered webhooks, one of them paused
- **WHEN** an administrator calls `webhookList`
- **THEN** the REST API answers `200` with both webhooks

#### Scenario: Unknown webhook
- **WHEN** an administrator calls `webhookGet` for `wh-does-not-exist`
- **THEN** the REST API answers `404`

### Requirement: Updating replaces the whole definition
The REST API SHALL replace a webhook's definition through `webhookUpdate`: an omitted `events` or `roomId` SHALL be cleared (every event type, every room) rather than preserved, and an omitted `enabled` SHALL become `true`. The `webhookId` and `creationDate` SHALL NOT change. An unknown identifier SHALL answer `404`.

#### Scenario: Omitted filters are cleared
- **GIVEN** a webhook with `events: ["recordingEnded"]` and `roomId: "room-123"`
- **WHEN** an administrator calls `webhookUpdate` with only a new `url` and `enabled: false`
- **THEN** the REST API answers `200` with the new URL, `enabled: false`, no `events` and no `roomId`
- **AND** the same `webhookId` and `creationDate`

#### Scenario: Update an unknown webhook
- **WHEN** an administrator calls `webhookUpdate` for `wh-does-not-exist` with a valid definition
- **THEN** the REST API answers `404`

### Requirement: Deleting a webhook
The REST API SHALL delete a webhook through `webhookDelete`, answering `200`, after which no further event SHALL be delivered to it. An unknown identifier SHALL answer `404`.

#### Scenario: Delete a webhook
- **GIVEN** a registered webhook
- **WHEN** an administrator calls `webhookDelete` for it and an event that it matched occurs afterwards
- **THEN** the REST API answers `200`
- **AND** the event is not delivered to its URL

#### Scenario: Delete an unknown webhook
- **WHEN** an administrator calls `webhookDelete` for `wh-does-not-exist`
- **THEN** the REST API answers `404`

### Requirement: Registry changes apply to the next event on every replica
The server SHALL decide which webhooks receive an event from the registry as it stands when the event is sent, so a registration, update, pause or deletion made through any replica SHALL apply to the next event sent by any replica.

#### Scenario: Webhook registered through one replica, event sent by another
- **GIVEN** a deployment with two Meet replicas
- **WHEN** an administrator registers a webhook through the first replica and a meeting then starts in a room whose media notifications reach the second replica
- **THEN** the webhook receives the `meetingStarted` event

#### Scenario: Webhook paused through one replica
- **GIVEN** a deployment with two Meet replicas and an enabled webhook
- **WHEN** an administrator sets `enabled: false` through the first replica and the second replica sends a matching event afterwards
- **THEN** the event is not delivered to that webhook

### Requirement: Testing a webhook
The REST API SHALL send, through `webhookTest`, one signed delivery whose `event` is `testEvent` to the stored URL of the webhook, whether it is enabled or paused. It SHALL answer `200` when the URL answers a `2xx` status within 5 seconds, and `400` with the reason otherwise, without retrying. An unknown identifier SHALL answer `404`.

#### Scenario: Reachable endpoint
- **GIVEN** a paused webhook whose URL answers `200`
- **WHEN** an administrator calls `webhookTest` for it
- **THEN** the URL receives exactly one `POST` carrying `event: "testEvent"`, a `data.message` and valid `X-Timestamp` and `X-Signature` headers
- **AND** the REST API answers `200`

#### Scenario: Unreachable or failing endpoint
- **GIVEN** a webhook whose URL refuses connections, answers `500` or takes longer than 5 seconds
- **WHEN** an administrator calls `webhookTest` for it
- **THEN** the REST API answers `400` with a message naming the URL and the reason
- **AND** the test delivery is attempted once only

#### Scenario: No API key to sign with
- **GIVEN** the deployment has no API key
- **WHEN** an administrator calls `webhookTest`
- **THEN** the REST API answers `400` stating that an API key is needed to use webhooks

### Requirement: Which webhooks receive an event
The server SHALL deliver each event to every enabled webhook whose `events` filter is absent or contains the event type and whose `roomId` is absent or equals the room the event belongs to. A paused webhook SHALL receive nothing. Every matching webhook SHALL receive the event independently.

#### Scenario: Event filter
- **GIVEN** one webhook filtered to `recordingEnded` and one webhook with no filter
- **WHEN** a meeting starts
- **THEN** only the webhook with no filter receives `meetingStarted`

#### Scenario: Room scope
- **GIVEN** one webhook scoped to room A and one with no room scope
- **WHEN** a meeting starts in room B
- **THEN** only the webhook with no room scope receives it

#### Scenario: Several matching webhooks
- **GIVEN** three enabled webhooks that match an event
- **WHEN** the event occurs
- **THEN** each of the three URLs receives it once

### Requirement: Delivery envelope
The server SHALL deliver an event as an HTTP `POST` with `Content-Type: application/json` whose body is the envelope `{ event, creationDate, data }`: `event` is the event type, `creationDate` the creation time in milliseconds since the epoch, and `data` the event's payload. All the webhooks receiving the same event SHALL receive the same body.

#### Scenario: One body for every endpoint
- **GIVEN** two webhooks that match an event
- **WHEN** the event is delivered
- **THEN** both receive byte-identical bodies with the same `X-Timestamp` and `X-Signature`

### Requirement: Deliveries are signed over the raw body
The server SHALL sign every delivery with HMAC-SHA256 keyed with the deployment's API key over the string `<timestamp>.<body>`, where `<body>` is exactly the bytes sent, and SHALL send the hexadecimal digest in `X-Signature` and the timestamp, equal to the envelope's `creationDate`, in `X-Timestamp`.

#### Scenario: Receiver verifies a delivery
- **WHEN** a receiver computes HMAC-SHA256 with the API key over its received `X-Timestamp`, a `.` and the body exactly as received
- **THEN** the hexadecimal result equals `X-Signature`

#### Scenario: Payload with non-ASCII text
- **GIVEN** a room named `Reunión 🎉`
- **WHEN** a meeting starts in it
- **THEN** the body carries the name as UTF-8 and the signature verifies over the bytes as received

### Requirement: The signing key follows the deployment's API key
The server SHALL read the API key when each event is sent: deliveries made after the API key is regenerated SHALL be signed with the new key, and while the deployment has no API key no delivery SHALL be attempted for any webhook.

#### Scenario: API key regenerated
- **GIVEN** an enabled webhook
- **WHEN** an administrator regenerates the API key and an event occurs afterwards
- **THEN** the delivery's signature verifies with the new key and not with the old one

#### Scenario: No API key
- **GIVEN** enabled webhooks and a deployment whose API key was revoked
- **WHEN** an event occurs
- **THEN** no request is sent to any webhook URL and nothing is retried later

### Requirement: Delivery timeout and retries
The server SHALL give each delivery attempt 5 seconds. A timeout, a connection error or a non-`2xx` answer SHALL be retried up to 5 times, waiting 0.3 seconds before the first retry and doubling the wait each time. Every attempt SHALL carry the same body and headers. After the last failed attempt the event SHALL be dropped for that webhook: it is not stored and cannot be requested again.

#### Scenario: Endpoint recovers during the retries
- **GIVEN** a webhook whose URL answers `503` twice and then `200`
- **WHEN** an event is delivered to it
- **THEN** the URL receives three identical requests, roughly 0.3 and 0.6 seconds apart

#### Scenario: Endpoint down for good
- **GIVEN** a webhook whose URL never answers
- **WHEN** an event is delivered to it
- **THEN** the server makes 6 attempts in total and then drops the event for that webhook

#### Scenario: Receiver answers too slowly
- **GIVEN** a receiver that processes a delivery but answers after 6 seconds
- **WHEN** the event is delivered
- **THEN** the server retries it, so the receiver gets the same body and signature again

### Requirement: Endpoints are delivered to independently
The server SHALL deliver an event to all its matching webhooks concurrently and retry each one on its own, so a slow or failing endpoint SHALL NOT delay, block or drop the delivery to the others, nor the delivery of later events.

#### Scenario: One endpoint down
- **GIVEN** two matching webhooks, one healthy and one whose URL is unreachable
- **WHEN** an event occurs
- **THEN** the healthy URL receives it without waiting for the other endpoint's retries

#### Scenario: Events keep flowing after a failed one
- **GIVEN** an event whose delivery failed on every webhook
- **WHEN** a later event occurs
- **THEN** the later event is delivered normally

### Requirement: Delivery never holds up the action that caused it
The server SHALL send webhooks in the background: the request or meeting action that produced an event SHALL complete with the same result whether its webhooks are delivered, retried or dropped.

#### Scenario: Slow receiver during a REST call
- **GIVEN** a webhook whose URL takes 5 seconds to answer
- **WHEN** a moderator promotes a participant through `participantRoleUpdate`
- **THEN** the REST API answers without waiting for the `participantRoleChanged` delivery

### Requirement: Events are delivered independently of their order
The server SHALL deliver each event independently of the others, so a receiver MAY receive events in a different order than they were created, for example when an earlier delivery is being retried. The envelope's `creationDate` SHALL give the order in which the events were created.

#### Scenario: Earlier event retried
- **GIVEN** a receiver that fails the `recordingStarted` delivery once and then accepts every delivery
- **WHEN** a recording starts and becomes active immediately
- **THEN** the receiver can get `recordingUpdated` before the retried `recordingStarted`
- **AND** `recordingStarted` carries the earlier `creationDate`

### Requirement: One webhook per occurrence across replicas
The server SHALL process a notification from the media server once even when several replicas receive the same notification at the same time, so the event it causes SHALL be sent once to each matching webhook.

#### Scenario: Same media notification reaches two replicas
- **GIVEN** a deployment with two Meet replicas and one matching webhook
- **WHEN** the media server's notification that a participant joined reaches both replicas concurrently
- **THEN** the webhook receives exactly one `participantJoined` for that participant

### Requirement: Webhook event catalogue
The server SHALL emit exactly the event types `meetingStarted`, `meetingEnded`, `participantJoined`, `participantLeft`, `participantRoleChanged`, `participantHandChanged`, `recordingStarted`, `recordingUpdated`, `recordingEnded`, `broadcastStarted`, `broadcastUpdated` and `broadcastEnded`, each triggered as its owning capability specifies. `testEvent` SHALL only be sent by `webhookTest` and is not an event type.

#### Scenario: Owner of each event
- **WHEN** a reviewer looks up when an event fires and what its payload means
- **THEN** `meetingStarted`, `meetingEnded`, `participantJoined` and `participantLeft` are specified in `meetings`
- **AND** `participantRoleChanged` in `meeting-moderation`
- **AND** `participantHandChanged` in `raise-hand`
- **AND** `recordingStarted`, `recordingUpdated` and `recordingEnded` in `recordings`
- **AND** `broadcastStarted`, `broadcastUpdated` and `broadcastEnded` in `live-broadcast`

#### Scenario: Filtering by an event type
- **WHEN** an administrator registers a webhook filtered to any subset of the twelve event types
- **THEN** the REST API accepts it, and rejects `testEvent` with `422`

### Requirement: Every payload names its room
The server SHALL include in every event's `data` the `roomId` of the room the event belongs to, which is the value a webhook's room scope is compared with.

#### Scenario: Recording event of a scoped webhook
- **GIVEN** a webhook scoped to room A
- **WHEN** a recording of room A ends
- **THEN** the webhook receives `recordingEnded` whose `data.roomId` is room A

### Requirement: Room payloads carry the full room
The server SHALL send a payload that is a room, such as the one of `meetingStarted` or `meetingEnded`, with the room's `config` and `roles` always included, although REST responses leave them out unless asked for. The permission keys of those `roles` follow the output rules of `permissions`.

#### Scenario: Meeting started payload
- **WHEN** a meeting starts in a room
- **THEN** the `meetingStarted` payload carries that room's `config` and `roles`

### Requirement: Participant payloads share one shape
The server SHALL send a participant event's `data` as the `roomId` and `roomName` of the meeting plus the participant under `participant`. An arrival or departure SHALL carry no media state, while a change to a participant already in the meeting SHALL carry the participant's live snapshot, media and hand state included.

#### Scenario: Arrival compared with a role change
- **WHEN** a participant joins and is later promoted
- **THEN** the `participantJoined` participant carries no `audioActive`, `videoActive` nor `screenShareActive`
- **AND** the `participantRoleChanged` participant carries them and `handRaised`

### Requirement: Initial webhook from the configuration
The server SHALL register, on every start while the deployment has no webhook, a webhook for every event of every room with the URL in `MEET_INITIAL_WEBHOOK_URL`. It SHALL start enabled only when `MEET_INITIAL_WEBHOOK_ENABLED` is `true` and `MEET_INITIAL_API_KEY` is set, and paused otherwise. An invalid URL, or a registration the registry refuses, SHALL be logged as a warning and skipped without stopping the start.

#### Scenario: First start with an initial webhook
- **GIVEN** `MEET_INITIAL_WEBHOOK_URL=https://example.com/hook`, `MEET_INITIAL_WEBHOOK_ENABLED=true`, `MEET_INITIAL_API_KEY` set and no webhook registered
- **WHEN** the server starts
- **THEN** one enabled webhook with that URL, no event filter and no room scope is registered

#### Scenario: Webhooks already registered
- **GIVEN** a registered webhook and `MEET_INITIAL_WEBHOOK_URL` set to another URL
- **WHEN** the server starts
- **THEN** no webhook is added

#### Scenario: Enabled requested without an initial API key
- **GIVEN** `MEET_INITIAL_WEBHOOK_ENABLED=true` but no `MEET_INITIAL_API_KEY`
- **WHEN** the server starts with no webhook registered
- **THEN** the initial webhook is registered paused

#### Scenario: Malformed initial webhook URL
- **GIVEN** `MEET_INITIAL_WEBHOOK_URL=not-a-url` and no registered webhook
- **WHEN** the server starts
- **THEN** it logs a warning naming the URL
- **AND** it serves requests with no webhook registered

#### Scenario: Two replicas start together
- **GIVEN** a deployment with two Meet replicas, no webhook and `MEET_INITIAL_WEBHOOK_URL` set
- **WHEN** both replicas start at the same time
- **THEN** exactly one webhook is registered

### Requirement: Upgrade moves the legacy webhook configuration into the registry
When upgrading a deployment that kept its webhook in the global configuration (3.8.0 and earlier), the server SHALL register that URL once as a webhook for every event of every room, keeping its enabled state, provided no webhook is registered yet. It SHALL then drop the legacy setting, so a deleted webhook never comes back. An invalid legacy URL SHALL be dropped without being registered.

#### Scenario: Upgrade with a configured webhook
- **GIVEN** a 3.8.0 database with webhooks enabled to `https://example.com/hook`
- **WHEN** the new version starts on it
- **THEN** one enabled webhook with that URL is registered and the legacy setting is gone

#### Scenario: Webhook deleted after the upgrade
- **GIVEN** an upgraded deployment whose migrated webhook an administrator deleted
- **WHEN** the server restarts
- **THEN** the webhook is not registered again

#### Scenario: Two replicas upgrade together
- **GIVEN** a deployment with two Meet replicas starting on the same 3.8.0 database
- **WHEN** both run the upgrade at the same time
- **THEN** exactly one webhook is registered from the legacy setting

### Requirement: Console webhooks list
The console SHALL list, in the webhooks section of the Embedded page, every registered webhook with its enabled state, its URL with a copy action, its event filter (or "all events") and its room scope (or "all rooms"), together with the number of enabled webhooks out of the total.

#### Scenario: Mixed webhooks
- **GIVEN** an enabled webhook with no filters and a paused one filtered to `recordingEnded` in room `room-123`
- **WHEN** an administrator opens the Embedded page
- **THEN** both rows are shown, the first with "all events" and "all rooms", the second with `recordingEnded` and `room-123`
- **AND** the count reads one active out of two

### Requirement: Console webhook editor
The console SHALL add and edit webhooks in a dialog that saves only an `http` or `https` URL, at least one event type when the filter is narrowed, and a room identifier when the scope is narrowed. A failed save SHALL keep the dialog open, with what was typed, and show the server's reason.

#### Scenario: Narrowed filter without events
- **WHEN** an administrator chooses selected events in the dialog and ticks none
- **THEN** the save action stays disabled

#### Scenario: Save refused by the server
- **GIVEN** 10 registered webhooks
- **WHEN** an administrator saves a new webhook in the dialog
- **THEN** the dialog stays open and a notice shows the limit message

### Requirement: Console webhook actions
The console SHALL let an administrator pause or resume a webhook with a toggle, delete it after a confirmation, and test it, showing whether the test delivery succeeded or the reason it failed.

#### Scenario: Pause from the list
- **WHEN** an administrator switches off the toggle of an enabled webhook
- **THEN** the webhook is updated with `enabled: false` and its URL, filter and room scope unchanged

#### Scenario: Test fails
- **GIVEN** a webhook whose URL refuses connections
- **WHEN** an administrator clicks its Test action
- **THEN** a notice shows that the test failed and the reason the server gave

### Requirement: Console requires an API key to add webhooks
The console SHALL warn, while the deployment has no API key, that deliveries need one to be signed, and SHALL disable adding webhooks until one exists.

#### Scenario: No API key
- **GIVEN** the deployment has no API key
- **WHEN** an administrator opens the Embedded page
- **THEN** the webhooks section shows the warning and the add action is disabled
