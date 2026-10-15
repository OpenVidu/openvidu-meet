# Tasks

## 1. Contracts

- [x] 1.1 Add `MeetBroadcastInfo`, `MeetBroadcastStatus`, `MeetBroadcastStartOptions`, `MeetBroadcastStopOptions`, `MEET_BROADCAST_FIELDS`, `config.broadcast` (`MeetBroadcastConfig`, `MeetBroadcastDestination`, `MeetRoomConfigOptions`, the redaction helpers and limits), `broadcastControl` and `broadcastAddDestinations`, `broadcastActive`, the broadcast webhook event types and the `meet_broadcast_updated` signal to the typings with TSDoc; verified by the typings build and the backend unit tests `broadcast-stream-url`, `broadcast-fields` and `permission-aliases`.
- [x] 1.2 Add the embedded commands `broadcastStart` and `broadcastStop` and the events `broadcastStarted`, `broadcastUpdated` and `broadcastEnded`; verified by the embedded API contract test.

## 2. Room config, permissions and migrations

- [x] 2.1 Validate `config.broadcast` (destinations, names, URLs, layout, encoding), keep full URLs in `broadcastDestinationUrls` and serve them redacted, resolve echoed redacted URLs, replace the destination list as a whole, require a destination while enabled and turn broadcast off under end-to-end encryption; redact the room creation log; verified by the unit tests `broadcast-schemas` and `broadcast.helper` and the integration tests `broadcast-room-config`, `e2ee-room-config`, `create-room` and `update-room-config`.
- [x] 2.2 Grant both permissions to the moderator role of new rooms, deny them to the speaker role, complete them to `false` on older rooms, members and tokens, and migrate rooms to v8 and room members to v6 with a refreshed `MIGRATION_REV`; verified by the unit test `permission-backfill-migrations` and the integration tests `room-migrations` and `room-member-migrations`.
- [x] 2.3 Document `MeetBroadcastConfig`, `MeetBroadcastDestination` and both permissions in the OpenAPI; verified by `redocly lint` and the API naming lint.

## 3. Broadcasts API

- [x] 3.1 Serve `broadcastStart`, `broadcastList`, `broadcastGet` and `broadcastStop` under `/meetings/{roomId}/broadcasts` with `broadcastControl`, `broadcastAddDestinations` and `meetingRead`, field selection, one broadcast per destination on one shared egress, all-or-nothing starts and the per-room Redis lock; verified by the unit tests `broadcast.service` and `broadcast.helper` and the integration tests `broadcasts` and `meeting-security`.
- [x] 3.2 Apply LiveKit egress events to each broadcast by its stream position, send the `meet_broadcast_updated` signal and the broadcast webhooks per change, replay the broadcasts in progress to a joining participant and add `broadcastActive` to `meetingGet`; verified by the unit tests `livekit-webhook.service` and `frontend-event.service` and the integration test `webhook`.
- [x] 3.3 End the broadcasts with their meeting, fail them when their egress service is lost, settle stale ones on the next start and answer `503` when no egress service is available; verified by the unit tests `broadcast.service` and `egress.helper` and live against the local deployment by killing the egress container.
- [x] 3.4 Document the broadcast operations, the three webhooks, `broadcastActive` and the egress-unavailable `503` in the OpenAPI; verified by `redocly lint` and the API naming lint.
- [x] 3.5 Compare destinations by stream key instead of whole URL, in the room config (`422`) and in start requests (`422` within the request, `409` against the broadcasts in progress), and say so in the OpenAPI and the typings TSDoc; verified by the unit test `broadcast.helper` and the integration tests `broadcasts` and `broadcast-room-config`.
- [x] 3.6 Withdraw the destination whose add failed together with the ones added before it, and stop an egress LiveKit still runs that no broadcast references when its first event arrives; verified by the unit test `broadcast.service` and the integration test `broadcasts` (an egress started behind Meet's back is stopped).

## 4. Recordings on the shared egress handling

- [x] 4.1 Answer `startRecording` with `503` when no egress service is available, `stopRecording` with `409` for a recording that ended while it was being stopped, and end `failed` a recording whose egress service is lost, ignoring its egress in the lock release, the orphan-lock clean-up and `recordingActive`; verified by the unit test `recording.service` and the integration tests `start-recording`, `stale-recordings-gc` and `orphaned-locks-gc`.

## 5. Meeting UI

- [x] 5.1 Keep the broadcasts of the meeting from the server's signals, and add the Live broadcast activity (destinations, statuses, go live, add for the meeting, stop, start, retry), the More options item, the `LIVE` status rail chip and the live and ended notices, translated in every locale; verified by the Karma specs `broadcast-state.service`, `status-rail.component`, `meeting-events.service`, `meeting-event-handler.service`, `broadcast-destination-editor` and `broadcast-platform.utils` and the SPA e2e suite `broadcasts`.

## 6. Console room wizard

- [x] 6.1 Add the Live broadcast step (switch, default destinations, layout), its end-to-end encryption exclusivity and its validation, and the broadcast permission switches of the Room Access step with their dependency on `broadcastControl`; verified by the Karma specs `wizard-state.service` and `features.utils` and the SPA e2e suite `room-wizard`.

## 7. Embedded API

- [x] 7.1 Run `broadcastStart` and `broadcastStop` on the webcomponent and the iframe, dispatch the three broadcast events, and add them to the testapp; verified by the Karma specs `embedded-command.service` and `iframe-bridge.service`, the webcomponent unit tests and the webcomponent e2e suites `commands`, `events` and `webhooks` on both integrations.

## 8. Verification on the rebased branch

- [x] 8.1 Run the typings build, the full `./meet.sh build`, the backend, frontend and webcomponent unit suites and the three lints on the branch rebased onto `main`; all pass.
- [x] 8.2 Run the backend integration suites `broadcasts` and `broadcast-room-config` and the SPA e2e suite `broadcasts` against the local deployment on the rebased branch; 31 of 31 and 5 of 5 pass, after making the lifecycle test wait for the retried unreachable destination to fail on its own.
- [ ] 8.3 Run the backend integration suites `room-migrations`, `start-recording` and `webhook`, the SPA e2e suite `room-wizard` and the webcomponent broadcast e2e suites against the local deployment on the rebased branch.

## 9. Release surfaces

- [x] 9.1 Add the 3.10.0 lines to `CHANGELOG.md`: Added > Integration (broadcasts API, permissions, embedded commands and events, webhooks, `broadcastActive`; `config.broadcast` and the redacted URLs), Added > UI (wizard step, activity, `LIVE` chip) and Fixed > Integration (the three recording fixes).
- [ ] 9.2 openvidu.io: write the live broadcast feature page `docs/meet/features/meetings/live-broadcast.md` (room destinations, going live, permissions, embedded API and webhooks) and register it in the navigation.
- [ ] 9.3 openvidu.io: say in `docs/meet/features/meetings/e2e-encryption.md` that end-to-end encryption also turns live broadcast off.
- [ ] 9.4 openvidu.io: add `broadcastControl` and `broadcastAddDestinations` to the predefined roles of `docs/meet/features/rooms/access.md`.
- [ ] 9.5 openvidu.io: list `broadcastStarted`, `broadcastUpdated` and `broadcastEnded` in `docs/meet/embedded/reference/webhooks.md`.
- [ ] 9.6 openvidu.io: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` and the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`.

## Workflow follow-up

- Archive the change with `/opsx:archive` inside the pull request once every task is done, then run `npx openspec validate --all --strict`.
- After archiving: title the new spec `# Live Broadcast Specification`, move `Broadcast permissions` next to the other permission groups of `permissions`, map `broadcast` to `live-broadcast` and add the Live broadcast step in the Purpose of `room-config`, and name broadcasts in the Purpose of `webhooks`.
