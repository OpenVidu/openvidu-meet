# Proposal

## Why

`bulkDeleteRecordings` and `downloadRecordings` take `recordingIds` as one comma-separated query
parameter with no upper bound. A long list overflows the request line or header limits of Meet and of
any proxy in front of it, and fails with an error that names no limit, the same problem that capped
`bulkDeleteRooms` at 100 ids. The `recordings` spec is silent about any limit.

## What Changes

- Both operations accept up to 100 distinct `recordingIds`, duplicates removed first, and answer
  `422` to more, with the same limit and message shape as `bulkDeleteRooms`.
- Every recordings list of the app (console Recordings page, room detail recordings tab, room
  recordings page) disables ZIP download and bulk delete for a selection of more than 100
  recordings, saying why.
- The OpenAPI parameter `recordingIds` states the limit.
- The `recordings` spec states the limit in "Deleting recordings in bulk" and "Downloading several
  recordings as a ZIP".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: "Deleting recordings in bulk" and "Downloading several recordings as a ZIP" gain the
  100-id limit, duplicate removal and the app's disabled bulk actions.

## Impact

- REST API: `bulkDeleteRecordings` and `downloadRecordings` (public) answer `422` above 100 distinct
  ids, where they used to try and usually fail with a server or proxy error. This narrows what the
  public contract accepts; it is documented in the OpenAPI.
- Console UI and room recordings page: bulk actions disabled above 100 selected recordings.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code: the recordings request schema, the recording list component of
  `shared-meet-components`, the OpenAPI parameter `recordings/parameters/recording-ids.yaml`.
- openvidu.io: the REST API reference is regenerated; no feature page changes.

## Decisions to confirm

- The limit is 100 ids, the same as `bulkDeleteRooms` (`BULK_DELETE_MAX_ITEMS`). Alternative: a
  different limit for recordings, whose ids are longer.
- Duplicate ids are removed before counting and processing, as `bulkDeleteRooms` does. Alternative:
  keep duplicates and let the repeated one fail.
- The app disables both bulk actions above 100 selected recordings. Alternative: the app
  splits the bulk delete into batches of 100 and only the ZIP download stays limited.
