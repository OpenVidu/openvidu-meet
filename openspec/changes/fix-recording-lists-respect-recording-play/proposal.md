# Proposal

## Why

The recording lists offer play and share on every complete recording, whatever the viewer's
`recordingPlay`. The console even opens the share dialog as if the user could play every listed
recording. A user or room member holding `recordingList` without `recordingPlay` sees play and share
actions that end on an error page or a `403`, although the server gates `getRecording`,
`getRecordingMedia` and `getRecordingUrl` with `recordingPlay`. The `recordings` spec describes the
lists offering play and share unconditionally, so the spec states the buggy behavior.

## What Changes

- The room recordings page offers play and share only to a visitor holding `recordingPlay`.
- The console's Recordings page and a room's Recordings tab resolve `recordingPlay` per room, as they
  already do for `recordingDownload` and `recordingDelete`, and offer play and share only for
  recordings of rooms that grant it.
- The share dialog no longer assumes access: whoever opens it says whether the viewer holds
  `recordingPlay` for that recording, removing the "has access by default" fallback.
- The `recordings` spec gates play and share by `recordingPlay` in "Room recordings page" and
  "Console recordings page".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: "Room recordings page" and "Console recordings page" offer play and share only with
  `recordingPlay`.

## Impact

- Console UI: Recordings page and a room's Recordings tab.
- Room recordings page (reached from the meeting, the join screen, an access link or the embedded
  `show-only-recordings`).
- REST API, webhooks, embedded API contract, deployment configuration: not affected; the server
  already enforces `recordingPlay`.
- Code: the recording list component, the recording actions service, the share dialog and the
  console pages that compute per-room permissions in `shared-meet-components`.
- openvidu.io: none (`docs/meet/features/recordings/management.md` already says the actions are
  subject to the recording permissions).

## Decisions to confirm

- Without `recordingPlay`, the lists hide play and share. Alternative: show them disabled with a
  tooltip naming the missing permission.
- `admin` users and room owners keep every action, as they hold every permission (see `permissions`).
