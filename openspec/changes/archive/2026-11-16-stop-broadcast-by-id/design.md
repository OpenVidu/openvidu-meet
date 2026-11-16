# Design

## Context

`BroadcastService.stopBroadcasts(roomId, { broadcastIds })` reads the room's broadcasts from their Redis hash under the per-room request lock, checks every id named (`404` unknown or of another room, `409` ending), then stops each through LiveKit egress. The meeting's Live broadcast activity calls it with one id per destination row and without ids for "Stop all"; the embedded command forwards its options to the same endpoint.

## Goals / Non-Goals

**Goals:** the identifier of the broadcast in the path of a `DELETE`, a bulk `DELETE` that names the broadcasts in its query with the contract of the other bulk operations, and the same split in the embedded API.

**Non-Goals:** `broadcastStart`, the broadcast object, the webhooks, the reconciliation sweep and the per-room lock, which stay as they are.

## Decisions

**`DELETE`, without a `stop` suffix.** A stopped broadcast is gone, as a kicked participant or an ended meeting is, so stopping it deletes it. `stopRecording` keeps `POST .../stop` only because `DELETE` already deletes a recording's files. Alternative considered: `DELETE /broadcasts/{broadcastId}/stop`; rejected because no `DELETE` of the API carries an action suffix.

**Finding the room of a broadcast.** `broadcastStop` no longer receives the `roomId`; the server derives it from the broadcast identifier with `BroadcastHelper.roomIdOf`, as `broadcastGet` already does, and checks `broadcastControl` in that room before any lookup, so a token of another room gets `403`, like every released operation addressed by an id of another room.

**The bulk stop copies `bulkDeleteRecordings`.** Broadcasts live at `/broadcasts`, outside a room, so the identifiers of one request may name several rooms: `broadcastControl` is checked per room (`withBroadcastControlOfEach`) and a broadcast the caller may not stop goes to `failed`, never a `403` for the whole request. Each broadcast then stops on its own under its room's lock; a broadcast not in progress, already ending or refused by LiveKit goes to `failed` with the error's message, and the others still stop. The answer is `200` or `400` with `deleted` and `failed`, ids only: the final state of each broadcast reaches the webhooks. Alternative considered: keep `POST /broadcasts/stop` with `{ roomId }` to stop a whole room; rejected to follow `lock-room`, whose "reject all" also lists the identities instead of having an operation of its own.

**`broadcastStopAll` resolves the broadcasts on the client.** The command and the activity's "Stop all" send the ids of the broadcasts the participant sees running. A start the participant asked for and the server has not answered yet is awaited first and its broadcasts added, so a stop right after a start still stops them, as the server-side stop of a whole room did by waiting on the room's lock.

**Several replicas.** Each broadcast stops under the existing per-room lock, so a stop on one replica and a bulk stop on another still serialize.

## Risks / Trade-offs

- [Stale ids on the client] → a broadcast that ended an instant before "Stop all" comes back in `failed` and the activity shows the refusal; the stop of the rest is not affected.
- [Open broadcast changes edit the same requirements, notably `adopt-egress-stream-destination-ids` and `fix-embedded-broadcast-stop-after-start`] → whichever archives later rebases its `live-broadcast` delta on the requirements this change renames and adds.
