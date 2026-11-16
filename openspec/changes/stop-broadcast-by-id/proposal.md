# Proposal

## Why

`broadcastStop` selects the broadcasts to stop with a `broadcastIds` list in the body, and stops all of them when the list is omitted. Released operations that end something live and leave nothing behind use `DELETE` on the element, with the element in the path (`participantKick`, `meetingEnd`), and act on several at once with a `DELETE` on the collection that names them in the query, each succeeding or failing on its own (`bulkDeleteRecordings`, and `bulkRejectWaitingParticipants` from `lock-room`). `stopRecording` is the exception, a `POST` with a `stop` suffix, because `DELETE` on a recording deletes its files; a broadcast keeps no file and is gone once stopped. Live broadcast is unreleased (3.10.0), so it can follow the rule without a deprecation period.

## What Changes

- **BREAKING (unreleased)** `broadcastStop` becomes `DELETE /api/v1/broadcasts/{broadcastId}`: it stops the broadcast named in the path and answers that broadcast, `403` for a token of another room, `404` when it is not in progress and `409` when it is already ending.
- New `bulkStopBroadcasts`, `DELETE /api/v1/broadcasts?broadcastIds=`: stops each broadcast named on its own, checking `broadcastControl` in each one's room, and answers `200` with the ones stopped in `deleted`, or `400` listing the rest in `failed`, as the other bulk operations do.
- `POST /api/v1/broadcasts/stop` goes away: no operation stops every broadcast of a room, and nothing is all or nothing any more.
- The embedded command `broadcastStop` takes `{ broadcastId }`, and the new command `broadcastStopAll()` stops the broadcasts the participant sees running through `bulkStopBroadcasts`, as `waitingParticipantRejectAll()` does for the waiting participants.
- `broadcastStart` is unchanged: `destinationIds` chooses what to create, not an existing element.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `live-broadcast`: stopping one broadcast by its identifier, stopping several by theirs, the responses and the embedded commands.
- `embedded-api`: `broadcastStopAll` joins the command catalogue.

## Impact

- **REST API**: `broadcastStop` changes method, path and body and `bulkStopBroadcasts` is added; breaking only against the unreleased 3.10.0 contract, so no deprecated alias.
- **Webhooks**: none; the broadcast webhooks are unchanged.
- **Embedded API**: `broadcastStop` changes its options, `broadcastStopAll` is added; the embedded API contract test changes.
- **Meeting UI**: the Live broadcast activity stops one destination or all through the new operations; nothing visible changes.
- **Console UI and deployment configuration**: none.
- **openvidu.io** (`next`): the live broadcast feature page where it shows stopping, and the regenerated REST and embedded references.
