## Context

`finishMeeting(roomId)` conditions on `status: active_meeting`, so the claim cannot tell meetings of one room apart. The LiveKit `sid` of the meeting is already passed to `handleRoomFinished` and ignored.

## Decision

Store the `sid` on the room in `activateMeeting` (cleared when the meeting ends). `finishMeeting(roomId, sid?)` adds the stored value to its filter when the caller knows it. A `room_started` with another `sid` while the room is `active_meeting` ends the recorded meeting (its `meetingEnded`, its cleanup) and activates the new one. When the claim finds no active meeting, `handleRoomFinished` still releases the name reservations and presence of the room. The reconciliation task reads the stored `sid` together with its active-meeting list and finishes with that `sid`.

## Alternatives

A Redis key per room holding the `sid` keeps Mongo unchanged but splits the claim over two stores and is lost when Redis is flushed.

## Several replicas

The claim stays one conditional MongoDB update, so the replica that wins is the only one that sends the webhook and cleans up; the webhook of a meeting reaches any replica, and replicas that lose the claim do nothing.

## Migration

None proposed: the field exists only while the room is `active_meeting`; idle rooms never carry it, and a room that is active during the upgrade has no value, which keeps today's claim by status. See the decision in `proposal.md`.
