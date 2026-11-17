# Design

## Context

See `proposal.md` for the motivation. What shapes the approach:

- The server already tells every participant of each recording change with the whole recording (`MeetRecordingInfo`): the signal `meet_recording_updated`, sent on every egress notice and again to a participant who joins while a recording is in progress. The embedded event is derived from that signal in the browser, in `MeetingEventHandlerService` of `shared-meet-components`, which today keeps only `recordingId` and `status` of it.
- The same service derives the three broadcast events from the signal `meet_broadcast_updated`: it keeps the last report of each broadcast, drops repeats and older reports, and names the event by where the report falls (first one, later one, final one). A report received before `meetingJoined` is kept and told as a start right after it.
- A recording and a broadcast have the same statuses and the same order (`starting`, `active`, `ending`, then one final status).

## Goals / Non-Goals

**Goals:**

- A recording and a broadcast are reported to the host by one rule, so the two cannot drift apart again.
- The embedded events carry the recording exactly as the signal brings it, with no mapping.

**Non-Goals:**

- No change to the server, the signals, the webhooks or the meeting UI.
- No event for a start or stop the server refuses.
- No recovery of a recording end missed during an outage: `fix-recording-indicator-after-reconnect` owns it.

## Decisions

### One rule names the event of a recording and of a broadcast

The service keeps one ledger per kind (last report by id) and one shared step decides, for a new report and the last one known, whether it is dropped, a start, an update or an end. A recording goes through the step the broadcast goes through today: dropped when what is known already ended, when the report is older, or when it equals the last one; otherwise told as ended when its status is final, as started when nothing was known, as updated in between. The recording's own forward-only status table and its separate notify method go away.

Two reports are equal when they hold the same fields with the same values, whatever their order: the server repeats a recording from storage and reports its changes from the media server, so one recording can arrive with its fields in a different order.

Alternative considered: keep the recording's own method and map its status to an event name. Rejected: two rules for one lifecycle is how the two contracts diverged, and the shared step is less code than the two it replaces.

### The ledger keeps the recording, not its status

The payload is the recording, so the ledger stores the last `MeetRecordingInfo`. On `meetingJoined` every recording still in progress in the ledger is told as `recordingStarted`, as the broadcasts are; one that ended before `meetingJoined` is not told at all, since the host never heard of it. A recording first known in a final state after `meetingJoined` is told as `recordingEnded` alone, as a broadcast is.

### Removal without alias

`RECORDING_STATUS_CHANGED`, its payload entry and `EmbeddedRecordingStatusChangedEvent` are deleted, and nothing is added to `EMBEDDED_EVENT_ALIASES`: the alias map exists for released names. The embedded API contract test pins the new list.

### Shells and test application

The webcomponent declares one output per event and the iframe bridge relays whatever the bus carries, so both follow the enum. The testapp binds the three events like the broadcast ones; the webcomponent e2e fixture derives its `.event-{name}` markers from `EmbeddedEventName`.

### Several Meet replicas

Nothing changes on the server. The signal reaches the meeting from whichever replica handles the media server's notice, and each browser orders what it receives by status, so an older signal from another replica is dropped, and a repeated one says nothing new because it equals the last one known.

## Risks / Trade-offs

- [A host receives `recordingUpdated` twice for one status when a field other than `status` changes] → It is what a broadcast does and what the webhook does; the payload differs each time, and repeats that are equal are dropped.
- [The recording reaches the host page with fields `recordingStatusChanged` did not carry (`filename`, `size`, dates)] → No new exposure: every participant's browser already receives them in the signal, and the host page already controls that browser's element.
- [`fix-recording-indicator-after-reconnect` was written against the old name] → Its proposal and delta spec are updated in this change, so it implements against `recordingEnded`.
