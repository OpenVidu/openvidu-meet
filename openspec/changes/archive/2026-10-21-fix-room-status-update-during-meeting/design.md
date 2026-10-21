# Design

## Context

`updateMeetRoomStatus` reads the room's `status`, decides, and writes `{ status, meetingEndAction }` with an
unconditional update. The meeting end (`handleRoomFinished`, run by whichever replica gets the LiveKit
`room_finished` webhook or runs the reconciliation sweep) reads `meetingEndAction` and then applies it with
another unconditional update. The repository already has a conditional single-document update
(`updatePartialOne` with a filter), used by `activateMeeting` to move a room to `active_meeting` only while
it is still `open`.

## Goals / Non-Goals

**Goals:**
- Decide the outcome from the room's current `status` and `meetingEndAction`, as the spec delta lists.
- Hold with several replicas: a status change and a meeting end handled at the same time on different
  replicas never leave an idle room with a pending action, nor apply an action that was just changed.

**Non-Goals:**
- Changing how `deleteRoom` schedules its action; it benefits from the conditional meeting end below
  without changes of its own.

## Decisions

### Conditional writes on both sides instead of a lock

`updateMeetRoomStatus` turns each branch into one `updatePartialOne` whose filter carries the state it
assumes:

| Request | Filter | Update | Answer |
| --- | --- | --- | --- |
| any, idle room | `status` in `open`, `closed` | `status`, `meetingEndAction: none` | `200` |
| `closed`, active | `status: active_meeting`, `meetingEndAction` not `delete` | `meetingEndAction: close` | `202` |
| `closed`, active, `delete` scheduled | no write | none | `202` with the room |
| `open`, active | `status: active_meeting`, `meetingEndAction` not `delete` | `meetingEndAction: none` | `200` |
| `open`, active, `delete` scheduled | no write | none | `409` |

When the write matches nothing because the state moved between the read and the write, the service reads
the room again and decides once more.

This half is implemented by `fix-meeting-ended-webhook-sent-twice` (`RoomRepository.finishMeeting`, branch
`fix/meetings`), which needs the same conditional write to send `meetingEnded` once: this change relies on it
instead of writing it twice. `handleRoomFinished` applies the action it read with a write filtered on that same `meetingEndAction`
(`close` and `none` branches; the `delete` branch cannot be cancelled any more). On a miss it reads the
room again and applies the action it now finds. Either side therefore sees the other's write: a close
scheduled just before the end is applied, and one scheduled just after finds the room idle and closes it
directly.

MongoDB applies each single-document update atomically, so no Redis lock is needed and the result is the
same whichever replica handles which request.

Alternative considered: a per-room Redis lock (`MutexService`) around both paths. It puts a lock on the
webhook path of every meeting end for a rare race, and the conditional writes give the same guarantee.

### `409` for reopening a room scheduled for deletion

A scheduled deletion comes from `deleteRoom` or the auto-deletion sweep; a status change must neither
cancel it silently nor report a reopen that will not happen. The error follows the existing `Room Error`
factories (`errorRoomActiveMeeting`). See proposal "Decisions to confirm".

## Risks / Trade-offs

- [Integrators that reopened a room during its meeting to cancel a scheduled deletion] → They now get
  `409`; the changelog line names the change.
- [A retry loop between the two writers] → Each side retries at most once after a miss; the second read
  always finds a state the other side has already finished writing.
