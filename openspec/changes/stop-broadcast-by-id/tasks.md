# Tasks

## 1. Typings

- [x] 1.1 Replace `broadcastIds` with `{ broadcastId }` in the `broadcastStop` command options, add the `broadcastStopAll` command and its message type, and type the answer of `bulkStopBroadcasts` (`MeetBroadcastBulkStopResponse`); TSDoc updated; verify with `./meet.sh build-typings`.

## 2. Backend

- [x] 2.1 Route `DELETE /broadcasts/{broadcastId}` (`broadcastStop`), checking `broadcastControl` in the room the id names before any lookup, answering the broadcast, `403`, `404` and `409` as specified; integration tests in the broadcasts suite for one stop, unknown id, another room's token and ending.
- [x] 2.2 Route `DELETE /broadcasts?broadcastIds=` (`bulkStopBroadcasts`): query schema (at most 100, duplicates ignored), `broadcastControl` per room, each broadcast stopped on its own with `deleted`/`failed`, `200`/`400`; schema and service unit tests, integration tests for a mixed stop, a full stop and tokens without the permission.
- [x] 2.3 Update the OpenAPI (paths, operationIds, parameters, request and response files, error descriptions); `redocly lint` and the API naming lint clean.

## 3. Meeting UI and embedded API

- [x] 3.1 The Live broadcast activity calls `broadcastStop` per destination and `bulkStopBroadcasts` with the running broadcasts for "Stop all", after a start still being answered; Karma specs of the broadcast services updated and passing.
- [x] 3.2 `EmbeddedCommandService`, the web component and the iframe bridge accept `broadcastStop({ broadcastId })` and `broadcastStopAll()`; the testapp commands panel follows; the embedded API contract test updated and passing.
- [ ] 3.3 Web component e2e `commands` broadcast cases and the SPA broadcast e2e updated; passing headless against the local deployment (updated and type-checked; the local egress never makes a broadcast active, so the lifecycle cases need CI).

## 4. Release surfaces

- [x] 4.1 `CHANGELOG.md`: the existing 3.10.0 live broadcast entry lists the `broadcastStopAll` command; its REST part already reads "stop one or several"; no Fixed or Breaking line, since the feature is unreleased.
- [x] 4.2 openvidu.io `next`: update the live broadcast feature page where it describes stopping one destination or all.
- [x] 4.3 Regenerate the REST reference and the embedded reference into `../openvidu.io`, and build the site in strict mode.

## Workflow follow-up

- After archive, update the Surfaces line of the `live-broadcast` Purpose with `bulkStopBroadcasts` and `broadcastStopAll`.
