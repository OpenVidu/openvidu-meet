## Why

The overview answers "how many rooms and recordings exist" but not what an administrator opens it to check: which rooms are free, which hold a meeting right now, whether a recording is running, and whether rooms are about to expire. Today they have to open the Rooms and Recordings lists, filter, and count.

## What Changes

- The overview's rooms card adds a breakdown of the rooms by status: open, in a meeting now, and closed, as a proportional bar with a legend that carries the three counts.
- The recordings card adds the number of recordings in progress now (`starting`, `active` or `ending`), or a quiet "no recording in progress" state.
- A third card, "Rooms expiring soon", shows how many rooms reach their `autoDeletionDate` in the next 7 days, and the name of the one that reaches it first, which opens that room's detail page.
- `getAnalytics` answers five more figures for the breakdown (`openRooms`, `closedRooms`), the recordings in progress (`recordingsInProgress`) and the expiring rooms (`roomsExpiringSoon`, `nextExpiringRoom`). The existing four figures and the admin-only access are unchanged.
- The cards have a design approved in the console design canvas; the states with nothing to show (no meeting, no recording running, no room expiring) are part of it.

Assumptions recorded here instead of asked:

- "Expiring" counts only a date still ahead. A room whose date has passed and that was not deleted (it was closed because it holds recordings, or it waits for its meeting to end) is already processed and is not "next to go". The card is titled "Rooms expiring soon" and not "Rooms to be deleted", because the default policy `withRecordings` `close` closes a room that holds recordings instead of deleting it.
- The window is fixed at 7 days, not configurable.
- The overview stays admin only; a `room_manager` or `room_member` still lands on the Rooms page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: the overview requirement shows the status breakdown, the recordings in progress and the expiring rooms; the analytics requirements answer and define the five new figures.

## Impact

- **Internal REST API** (`getAnalytics`, `/internal-api/v1/analytics`): five new fields in the response, additively. The internal API carries no compatibility promise; the public REST API, webhooks and embedded API are untouched.
- **Console UI**: overview page and its console translations (a language without the new texts shows them in English, as `localization` already specifies).
- **Typings**: `MeetAnalytics` gains the fields, with TSDoc.
- **Backend**: four more MongoDB counts and one one-document read, all served by the existing status, `autoDeletionDate` and recording status indexes (1 to 20 ms with 100,000 rooms and 500,000 recordings, read from the index only, no document fetched). No persisted field, no migration, no new index.
- **Several replicas**: every figure is computed from MongoDB on request; no replica holds state.
- **openvidu.io**: no page describes the overview or the analytics endpoint; none changes.
- **CE extension seam**: none needed; the figures reach PRO through the same service and component the CE overview uses.
