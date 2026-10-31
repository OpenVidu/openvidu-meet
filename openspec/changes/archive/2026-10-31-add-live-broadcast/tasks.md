# Tasks

## 1. Contracts

- [x] 1.1 Add `MeetBroadcastInfo`, `MeetBroadcastStatus`, `MeetBroadcastStartOptions`, `MeetBroadcastStopOptions`, `MEET_BROADCAST_FIELDS`, `config.broadcast` (`MeetBroadcastConfig`, `MeetBroadcastDestination`, `MeetRoomConfigOptions`, the redaction helpers and limits), `broadcastControl` and `broadcastEdit`, `broadcastActive`, the broadcast webhook event types and the `meet_broadcast_updated` signal to the typings with TSDoc; verified by the typings build and the backend unit tests `broadcast-stream-url`, `broadcast-fields` and `permission-aliases`.
- [x] 1.2 Add the embedded commands `broadcastStart` and `broadcastStop` and the events `broadcastStarted`, `broadcastUpdated` and `broadcastEnded`; verified by the embedded API contract test.

## 2. Room config, permissions and migrations

- [x] 2.1 Validate `config.broadcast` (destinations, names, URLs, layout, encoding), keep full URLs in `broadcastDestinationUrls` and serve them redacted, resolve echoed redacted URLs, replace the destination list as a whole, require a destination while enabled and turn broadcast off under end-to-end encryption; redact the room creation log; verified by the unit tests `broadcast-schemas` and `broadcast.helper` and the integration tests `broadcast-room-config`, `e2ee-room-config`, `create-room` and `update-room-config`.
- [x] 2.2 Grant both permissions to the moderator role of new rooms, deny them to the speaker role, complete them to `false` on older rooms, members and tokens, and migrate rooms to v9 and room members to v6 with a refreshed `MIGRATION_REV`; verified by the unit test `permission-backfill-migrations` and the integration tests `room-migrations` and `room-member-migrations`.
- [x] 2.3 Document `MeetBroadcastConfig`, `MeetBroadcastDestination` and both permissions in the OpenAPI; verified by `redocly lint` and the API naming lint.

## 3. Broadcasts API

- [x] 3.1 Serve `broadcastStart`, `broadcastList`, `broadcastGet` and `broadcastStop` under `/broadcasts`, shaped like the recordings API (room in the start and stop bodies and the list query, `broadcastId` naming its room for get), with `broadcastControl`, `broadcastEdit` and `meetingRead`, field selection, one broadcast per destination on one shared egress, all-or-nothing starts and the per-room Redis lock; verified by the unit tests `broadcast.service` and `broadcast.helper` and the integration tests `broadcasts` and `meeting-security` (48 of 48).
- [x] 3.2 Apply LiveKit egress events to each broadcast, send the `meet_broadcast_updated` signal and the broadcast webhooks per change, replay the broadcasts in progress to a joining participant and add `broadcastActive` to `meetingGet`; verified by the unit tests `livekit-webhook.service` and `frontend-event.service` and the integration test `webhook`.
- [x] 3.3 End the broadcasts with their meeting, fail them when their egress service is lost, settle stale ones on the next start and answer `503` when no egress service is available; verified by the unit tests `broadcast.service` and `egress.helper` and live against the local deployment by killing the egress container.
- [x] 3.4 Document the broadcast operations, the three webhooks, `broadcastActive` and the egress-unavailable `503` in the OpenAPI; verified by `redocly lint` and the API naming lint.
- [x] 3.5 Compare destinations by stream key instead of whole URL, in the room config (`422`) and in start requests (`422` within the request, `409` against the broadcasts in progress), and say so in the OpenAPI and the typings TSDoc; verified by the unit test `broadcast.helper` and the integration tests `broadcasts` and `broadcast-room-config`.
- [x] 3.6 Withdraw the destination whose add failed together with the ones added before it, and stop an egress LiveKit still runs that no broadcast references when its first event arrives; verified by the unit test `broadcast.service` and the integration test `broadcasts` (an egress started behind Meet's back is stopped).
- [x] 3.7 Keep the broadcasts of a room in Redis without expiry, forgotten by the meeting's end (`room_finished` or the meeting reconciliation) instead of a 24 h TTL that could drop a broadcast still streaming; verified by the unit test `broadcast.service` (`BroadcastStateService`).
- [x] 3.8 Move the broadcasts API from `/meetings/{roomId}/broadcasts` to a top-level `/broadcasts` group like the recordings one, with the single stop by id and the bulk stop, register `broadcasts` in `MEET_API_REST_GROUPS` and the naming charter, and update the OpenAPI, the frontend client and the e2e helper; verified by the unit tests `broadcast-schemas` and `broadcast.helper`, the API naming lint, `redocly lint`, the integration tests `broadcasts`, `broadcast-room-config` and `meeting-security` (63 of 63), the SPA e2e suite `broadcasts` (5 of 5) and the frontend unit suite (900 of 900).
- [x] 3.9 Find each broadcast's stream by the tag `#ov-stream-tag=<broadcastId>` its URL carries, which the OpenVidu egress reports back (egress fork branch `stream-url-tag`, `pkg/config/urls.go` and its Go test), answer `500` and withdraw against an egress without it, and keep a broadcast from moving back on an older snapshot; verified by the unit tests `broadcast.helper` and `broadcast.service`, the Go tests of `pkg/config` and the integration tests `broadcasts`, `broadcast-room-config` and `meeting-security` (63 of 63) against the patched egress.
- [x] 3.10 Reconcile a room's broadcasts with LiveKit on the egress `participant_left`, on every start and in a sweep at startup and every minute, ending those of a meeting, an egress or an egress service that ended unreported; write the Redis value only when a record changes and answer `broadcastActive` with `EXISTS`; verified by the unit test `broadcast.service` and black-box against the images `openvidu/openvidu-meet:broadcast-tag` (two replicas) and `openvidu/egress:stream-tag`: lifecycles, churn of 91 broadcasts, egress killed with Meet up and down, LiveKit down 10 s and 90 s, meeting and stream ended while Meet was down, reads during a held lock; every broadcast started and ended once and no Redis key, lock, egress or stream was left.
- [x] 3.11 Split the start body into `destinationIds` (room destinations; omitted means every one not streamed to yet, empty means none) and `destinations` (for that meeting only), answering `400` to an id the room does not have, across the backend, typings, OpenAPI, UI, embedded API, tests and docs.
- [x] 3.12 Stop broadcasts through `POST /broadcasts/stop` alone (`broadcastStop`, `roomId` and optional `broadcastIds`), dropping `POST /broadcasts/{broadcastId}/stop`, and document the `destinationIds` values and the `broadcasts` list of the start and stop responses in the OpenAPI; verified by the unit test `broadcast-schemas`, `redocly lint` and the integration tests `broadcasts` and `meeting-security` (48 of 48).
- [x] 3.13 Group the destination of a broadcast in `destination` (`id`, `name`, `url`), the shape of a room config destination, in the typings, the backend, the field projection, the OpenAPI (with coherent examples for the schema and the three webhooks), the frontend, the embedded events and the docs; verified by the backend unit suite (685 of 685), `redocly lint`, the integration tests `broadcasts`, `broadcast-room-config` and `meeting-security` (70 of 70), the frontend unit suite (914 of 914), the SPA e2e suite `broadcasts` (5 of 5) and the broadcast tests of the webcomponent e2e suites `commands`, `events` and `webhooks` on both integrations.

## 4. Recordings on the shared egress handling

- [x] 4.1 Answer `startRecording` with `503` when no egress service is available, `stopRecording` with `409` for a recording that ended while it was being stopped, and end `failed` a recording whose egress service is lost, ignoring its egress in the lock release, the orphan-lock clean-up and `recordingActive`; verified by the unit test `recording.service` and the integration tests `start-recording`, `stale-recordings-gc` and `orphaned-locks-gc`.

## 5. Meeting UI

- [x] 5.1 Keep the broadcasts of the meeting from the server's signals, and add the Live broadcast activity (destinations, statuses, go live, add for the meeting, stop, start, retry), the More options item, the `LIVE` status rail chip and the live and ended notices, translated in every locale; verified by the Karma specs `broadcast-state.service`, `status-rail.component`, `meeting-events.service`, `meeting-event-handler.service`, `broadcast-destination-editor` and `broadcast-platform.utils` and the SPA e2e suite `broadcasts`.
- [x] 5.2 Answer each start and stop of the activity on its own, so a destination being started stays connecting and a refusal stays shown whatever is asked meanwhile, run the embedded `broadcastStart` and `broadcastStop` through the same requests (a stop goes through while a start is pending), and vet a start's destinations before the room's broadcast lock is taken; verified by the frontend unit suite (917 of 917), the backend unit suite (685 of 685), the integration tests `broadcasts`, `broadcast-room-config` and `meeting-security` (70 of 70), the SPA e2e suite `broadcasts` (6 of 6, the new case failing on the previous activity) and the broadcast tests of the webcomponent e2e suites `commands`, `events` and `webhooks` on both integrations.

## 6. Console room wizard

- [x] 6.1 Add the Live broadcast step (switch, default destinations, layout), its end-to-end encryption exclusivity and its validation, and the broadcast permission switches of the Room Access step with their dependency on `broadcastControl`; verified by the Karma specs `wizard-state.service` and `features.utils` and the SPA e2e suite `room-wizard`.

## 7. Embedded API

- [x] 7.1 Run `broadcastStart` and `broadcastStop` on the webcomponent and the iframe, dispatch the three broadcast events, and add them to the testapp; verified by the Karma specs `embedded-command.service` and `iframe-bridge.service`, the webcomponent unit tests and the webcomponent e2e suites `commands`, `events` and `webhooks` on both integrations.

## 8. Verification on the rebased branch

- [x] 8.1 Run the typings build, the full `./meet.sh build`, the backend, frontend and webcomponent unit suites and the three lints on the branch rebased onto `main`; all pass.
- [x] 8.2 Run the backend integration suites `broadcasts` and `broadcast-room-config` and the SPA e2e suite `broadcasts` against the local deployment on the rebased branch; 31 of 31 and 5 of 5 pass, after making the lifecycle test wait for the retried unreachable destination to fail on its own.
- [x] 8.3 Run the backend integration suites `room-migrations`, `start-recording` and `webhook`, the SPA e2e suite `room-wizard` and the webcomponent broadcast e2e suites against the local deployment on the rebased branch; all pass in CI (run 41222435988, with `main` merged in at 75afb573c).

## 9. Release surfaces

- [x] 9.1 Add the 3.10.0 lines to `CHANGELOG.md`: Added > Integration (broadcasts API, permissions, embedded commands and events, webhooks, `broadcastActive`; `config.broadcast` and the redacted URLs), Added > UI (wizard step, activity, `LIVE` chip) and Fixed > Integration (the three recording fixes).
- [x] 9.2 openvidu.io: write the live broadcast feature page `docs/meet/features/meetings/live-broadcast.md` (room destinations, going live, permissions, embedded API and webhooks) and register it in the navigation.
- [x] 9.3 openvidu.io: say in `docs/meet/features/meetings/e2e-encryption.md` that end-to-end encryption also turns live broadcast off.
- [x] 9.4 openvidu.io: add `broadcastControl` and `broadcastEdit` to the predefined roles of `docs/meet/features/rooms/access.md`.
- [x] 9.5 openvidu.io: list `broadcastStarted`, `broadcastUpdated` and `broadcastEnded` in `docs/meet/embedded/reference/webhooks.md`.
- [x] 9.6 openvidu.io: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` and the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`; the embedded reference generator now renders nested object types and a command whose payload is a named options type (`broadcastStart(options?)`).

## Workflow follow-up

- Archive the change with `/opsx:archive` inside the pull request once every task is done, then run `npx openspec validate --all --strict`.
- After archiving: title the new spec `# Live Broadcast Specification`, move `Broadcast permissions` next to the other permission groups of `permissions`, map `broadcast` to `live-broadcast` and add the Live broadcast step in the Purpose of `room-config`, and name broadcasts in the Purpose of `webhooks`.
