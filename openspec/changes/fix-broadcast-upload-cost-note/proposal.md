# Proposal

## Why

The room wizard and the meeting's Live broadcast activity estimate the server upload a broadcast needs
at a fixed 3 Mbps per destination, the 720p default. A room whose broadcasts are encoded at 1080p, or with
a higher bitrate set through the REST API, is shown half or less of what streaming actually costs, while
the estimate is there precisely so nobody takes streaming to be cheap.

## What Changes

- The upload per destination comes from the encoding the broadcasts stream with: the bitrate of the
  room's `broadcast.encoding` preset, or the video plus audio bitrate of its encoding options.
- The wizard uses the room's `broadcast.encoding` (the stored one when editing a room, the default when
  creating one). The activity uses the room's `broadcast.encoding` before going live, and the `encoding`
  the live broadcasts report while live.
- The wizard's note no longer says the rate is for 720p, in every supported language.
- No delta of its own: `live-broadcast` is still being added by `add-live-broadcast`, whose requirement
  "Going live from the activity" ("show the upload the chosen ones need") gets a scenario with another
  encoding, and whose requirement "Live broadcast in the room wizard" names the estimate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task updates the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Console UI: the upload note of the wizard's Live broadcast step.
- Meeting UI: the upload estimates of the Live broadcast activity, before going live and while live.
- REST API, webhooks, embedded API, deployment configuration: not affected.
- Code: `meet-ce/frontend/projects/shared-meet-components/src/lib/shared/models/broadcast.model.ts`,
  `BroadcastConfigComponent` and the wizard state of the rooms domain, `BroadcastActivityComponent`, and
  the `COST_NOTE` strings of the rooms and meeting language files.
- openvidu.io: `docs/meet/features/meetings/live-broadcast.md`, the "Server upload" note.

## Decisions to confirm

- How the estimate is rounded. Proposed: to whole Mbps, as today (about 3, 5 and 6 Mbps per destination
  for the 720p 30 fps, 720p 60 fps or 1080p 30 fps, and 1080p 60 fps presets). Alternative: one decimal
  place, which shows the 128 kbps of audio but reads as more precise than an estimate is.

## Source

3.10.0 pre-release audit, finding BF-8 (low, static-high), introduced by #120.
