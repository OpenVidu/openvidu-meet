## Why

A meeting held in Meet could only be watched by its participants or recorded for later. Webinars,
town halls and classes need the same meeting streamed live to an audience outside it, on YouTube,
Twitch or any RTMP server, without a separate streaming tool.

## What Changes

- A room saves up to five default RTMP destinations, and the layout and encoding a broadcast streams
  with, in `config.broadcast`. Live broadcast is off by default, needs at least one destination to be
  on, and is excluded by end-to-end encryption like recording. Stream keys are never served: every
  response, webhook and embedded event carries the URL with its key replaced by `********`, and a
  redacted URL sent back keeps the saved key.
- A live meeting streams to each destination as its own broadcast, with its own status, up to five at
  once and each with its own stream key: to the room's destinations, all or a subset, and to
  destinations given for that meeting only. A stream the media server runs without a broadcast that
  reports it, because the request that asked for it failed, is stopped.
  New REST operations under `/api/v1/meetings/{roomId}/broadcasts` (`broadcastStart`, `broadcastList`,
  `broadcastGet`, `broadcastStop`), webhooks `broadcastStarted`, `broadcastUpdated` and
  `broadcastEnded`, embedded commands `broadcastStart` and `broadcastStop`, embedded events of the
  same three names, and `broadcastActive` in the meeting info.
- Two new permissions: `broadcastControl` (go live, stop and restart each destination) and
  `broadcastAddDestinations` (stream to a destination the room does not have). Rooms created from
  3.10.0 grant both to the moderator role; rooms, members and tokens from before start without them.
- Meeting UI: a Live broadcast activity in the activities panel, a start and stop item in More
  options, a `LIVE` chip with the time on air in the status rail, and a notice to every participant
  when the meeting goes live and when it stops. Console: a Live broadcast step in the room wizard and
  the two permissions in the Room Access step.
- Recording fixes from the shared egress handling: `startRecording` answers `503` when no egress
  service is available, and a recording whose egress service dies ends `failed` instead of staying in
  progress for good.

## Capabilities

### New Capabilities

- `live-broadcast`: streaming a live meeting to RTMP destinations, on every surface: the room's
  default destinations, the broadcasts of a meeting and their lifecycle, who may control them, how
  every participant learns about them, and how a lost broadcast is settled.

### Modified Capabilities

- `room-config`: the default and partial config, the switch rule, the cross-field rules and the merge
  rule now cover `broadcast`, whose destination list is replaced as a whole.
- `permissions`: twenty-two permissions instead of twenty, the broadcast permissions, their role
  defaults, their completion on older data, and no deprecated name for them.
- `embedded-api`: the command and event catalogues list the broadcast commands and events.
- `webhooks`: the event catalogue lists the three broadcast events.
- `meetings`: the meeting info says whether a live broadcast is in progress.
- `meeting-layout`: the status rail holds the `LIVE` mark.
- `rooms`: the wizard has a Live broadcast step, blocks finishing with live broadcast on and no
  destination, and keeps end-to-end encryption exclusive with live broadcast too.
- `recordings`: `startRecording` answers `503` without an egress service, and a recording whose egress
  service is lost ends `failed`.

## Impact

- REST API, additive: four new operations, the `config.broadcast` object, two permission keys,
  `broadcastActive` in `meetingGet`, and the `503` of `startRecording`. No existing field changes.
- Webhooks, additive: three new event types accepted by the webhook event filters.
- Embedded API, additive: two commands and three events on the webcomponent and the iframe, and the
  frozen embedded API contract test updated.
- Meeting UI and console UI: new activity, toolbar item, status rail chip, notices, wizard step and
  permission switches, translated in every supported language.
- Deployment: no new configuration variable. Schema migrations bump rooms to v8 and room members to
  v6. Broadcasts need the deployment's egress service, outbound RTMP from it, and about 3 Mbps of
  upload per destination at 720p.
- CE extension seams: the activity, the toolbar item and the status rail chip are switchable through
  the meeting UI configuration and inputs, so PRO can replace or extend them.
- openvidu.io: a new live broadcast feature page; `e2e-encryption.md` (encryption also excludes
  live broadcast); `rooms/access.md` (the two permissions in the predefined roles); the webhooks
  reference page; the regenerated embedded API and REST API references.
