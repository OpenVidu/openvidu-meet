# Design

## Context

Three paths give a recording its final status today: the media server's end notification (stores
the reported status, sends `recordingEnded` and the in-meeting signal, releases the room's recording
hold), the stale-recordings clean-up (writes `aborted` only), and the room deletion's stop fallback
(writes `aborted` when the stopped recording is not `complete` after a second). Only the first one
reports. The clean-up lists the processes in progress, so a process that has just ended and one the
media server has forgotten look the same to it.

## Goals / Non-Goals

**Goals:** every final status is stored once and reported once, whichever path and replica reaches
it first.

**Non-Goals:** changing the clean-up schedule, its 5-minute stale threshold, or the orphan-lock
clean-up.

## Decisions

- **One finishing path.** A single recording-service operation stores a final status and, only when
  it was the one that stored it, sends `recordingEnded`, sends the in-meeting signal and releases the
  room's recording hold when no process is left. The end notification, the clean-up and the room
  deletion fallback all go through it.
- **First final status wins, atomically.** The store is a conditional update in MongoDB that matches
  the recording only while its status is `starting`, `active` or `ending`. Two replicas racing (the
  clean-up on one, the end notification on another) cannot both match, so exactly one reports. No
  Redis lock is needed, and no persisted field changes, so no migration.
- **Ask the media server before aborting.** For a recording whose process is not in progress, the
  clean-up fetches that process by id (the media server keeps ended processes for about a day). An
  ended process gives its reported final status; an unknown one gives `aborted`. This closes the
  race where the clean-up would abort a recording whose `complete` end notification is in flight.
- **Stale but alive: stop only.** The clean-up stops the process and lets its end notification
  finish the recording. If that notification never comes, a later run finds the process gone and
  finishes it through the rule above. Rejected: keep writing `aborted` before the stop, which with the
  first-wins rule would hide a `complete` file.

## Risks / Trade-offs

- [A room deletion fallback now reports `aborted` for a recording whose `complete` notification
  arrives later] → the recording is deleted right after with its room, so only the reported status
  differs; the window is the fallback's one-second wait.
- [Ended processes older than the media server's retention are finished as `aborted` even if they
  completed] → only when the end notification was lost and the clean-up did not run for a day.
