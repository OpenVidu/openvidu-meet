# Proposal

## Why

The stale-recordings clean-up marks a lost recording `aborted` with a direct write: no
`recordingEnded` webhook is sent, the room's participants keep seeing the recording mark, an
embedded host never receives `recordingStatusChanged` with the end, and the room stays held as being
recorded until the next orphan-lock clean-up. The `recordings` spec says every recording reaches one
final status and that `recordingEnded` carries it, but the clean-up requirement is silent about
reporting it.

## What Changes

- A recording ended by the clean-up is reported like any other end: `recordingEnded` webhook,
  in-meeting status (which ends the recording mark and dispatches `recordingStatusChanged`) and
  release of the room's recording hold.
- When the media server still remembers the ended process, the clean-up uses the final status it
  reports instead of `aborted`; `aborted` stays for a process the media server no longer knows.
- A stale recording whose process still exists is stopped and its end is reported by the media
  server's end notification, as for any stop, instead of being written `aborted` beforehand.
- Every path that gives a recording its final status does it once: the first final status stored
  wins, and only that path reports it, on any number of replicas.
- The `recordings` spec states the reporting in "Clean-up of stale recordings".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: "Clean-up of stale recordings" ends lost recordings with the media server's final
  status or `aborted`, reports them like any other end, and adds the report and replica scenarios.

## Impact

- Webhooks: `recordingEnded` is now sent for recordings ended by the clean-up (additive, the payload
  is unchanged); a recording never gets two `recordingEnded`.
- Embedded API: `recordingStatusChanged` reaches the host with the final status of such recordings
  (no contract change).
- Meeting UI: the recording mark and the activities panel leave the in-progress state.
- REST API: the final status of a stale recording that the clean-up stops is the one the media server
  reports (often `complete`, with its file) instead of `aborted`.
- Console UI, deployment configuration: not affected.
- Code: the recordings clean-up, the media server end notification handling, the room deletion's
  stop fallback and the recording repository in `meet-ce/backend`.
- openvidu.io: none (the recordings pages do not describe the clean-up).

## Decisions to confirm

- The clean-up reports the end through the webhook, the in-meeting status and the embedded event,
  like any end (decided). Alternative: webhook only.
- A stale recording whose process still exists is only stopped, and keeps the final status the media
  server reports (possibly `complete`) (decided). Alternative: keep forcing `aborted` on it.
- The first final status stored wins and a later end notification for the same recording is ignored,
  so `recordingEnded` is sent once (decided). Alternative: let the later notification overwrite the status and
  send a second `recordingEnded`.
