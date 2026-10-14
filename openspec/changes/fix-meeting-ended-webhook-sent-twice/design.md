# Design

## Context

`handleRoomFinished` reads the room, decides by `meetingEndAction` whether to delete it, close it or reopen it, sends `meetingEnded` and cleans up (participant names, presence, recording lock, AI assistant). It is called from the LiveKit `room_finished` webhook (deduplicated across replicas only while the 5 s webhook lock is held) and from `reconcileActiveMeetingsGoneFromLiveKit`, which lists rooms in `active_meeting` and calls it for those LiveKit no longer knows. Nothing ties those calls together, so two of them can both see `active_meeting` and both send the webhook. `handleRoomStarted` already solved the symmetric problem with `activateMeeting`, a conditional update `open -> active_meeting`.

## Goals / Non-Goals

**Goals:**
- Exactly one `meetingEnded` per meeting, whichever paths and replicas report the end.
- Keep the end-of-meeting clean-up idempotent and run it once.

**Non-Goals:**
- Changing what each `meetingEndAction` does, or the `updateRoomStatus` interactions listed separately in the findings.

## Decisions

- **The status transition is the claim.** The repository gets a conditional finish operation filtered on `{ roomId, status: active_meeting }`: for `delete` it deletes the document only if that filter matches, for `close` and `none` it updates it to `closed`/`open` (and resets `meetingEndAction`) only if the filter matches. The caller that gets the document back is the owner of the end: it sends `meetingEnded` and runs the clean-up. A caller that matches nothing logs and returns. MongoDB applies a single-document conditional write atomically, so this holds across any number of replicas without a Redis lock.
  - Alternative: a Redis lock per room around the whole handler. Rejected: it serializes the two callers but the second one still finds the room already reopened as `open` and needs the same status check to know it must not send the webhook; the check alone is enough.
  - Alternative: an idempotency key per LiveKit room `sid`. Rejected: the reconciliation path does not know the `sid`.
- **Recording auto-start reactivation and the duration-limit timer cancel stay before the claim.** Both are idempotent, so running them in a losing caller is harmless, and moving them after the claim would change their ordering relative to the webhook for no gain.
- **The `closed`-room resurrection path** (`handleRoomStarted` deletes a LiveKit room opened in a `closed` room) then produces a `room_finished` for a room that is not `active_meeting`: with the guard it sends no `meetingEnded`, consistent with the `meetingStarted` it never sent.

## Risks / Trade-offs

- [A room whose status was moved out of `active_meeting` by another path while a meeting still runs (for example `updateRoomStatus` during a meeting) would get no `meetingEnded` at its end] -> That path is a separate finding; the reconciliation check also repairs it, since it only acts on `active_meeting` rooms.
- [The losing caller skips the participant-name and AI-assistant clean-up] -> The winning caller runs it; both clean-ups are already safe to run once.
