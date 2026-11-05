# Design

## Context

The overview calls `getAnalytics`, which `AnalyticsService` answers with four counts taken in parallel from `RoomRepository` and `RecordingRepository` (`totalRooms`, `activeRooms`, `totalRecordings`, `completeRecordings`). The page shows two cards, rooms and recordings, built from those four numbers. See `proposal.md` for what the new cards show; the layout is the approved design canvas.

Measured on a seeded MongoDB 8.0 (100,000 rooms, 500,000 recordings), every new figure is served from an index without fetching documents:

| Figure | Query | Index | Time |
| --- | --- | --- | --- |
| `openRooms`, `closedRooms` | count by `status` | `status_1_creationDate_-1__id_-1` | 2 to 19 ms |
| `recordingsInProgress` | count `status` in `starting`, `active`, `ending` | `status_1_startDate_-1__id_-1` | 2 ms |
| `roomsExpiringSoon` | count `autoDeletionDate` between now and now + 7 days | `autoDeletionDate_1__id_1` | 2 ms |
| `nextExpiringRoom` | first by `autoDeletionDate` ascending from now | `autoDeletionDate_1__id_1` | 1.4 ms |

## Goals / Non-Goals

**Goals:**
- The new figures arrive in the same `getAnalytics` response, so the overview still makes one request.
- No persisted field, no new index, no migration.

**Non-Goals:**
- Storage used, recorded hours and any figure that needs reading every recording (about 200 ms with 500,000 recordings): they need a cache or a counter, decided separately.
- An overview for `room_manager` and `room_member`: `getAnalytics` stays admin only.
- Links from the status breakdown to the filtered Rooms list.
- A configurable expiry window.

## Decisions

**Flat fields, not a nested object.** `MeetAnalytics` gains `openRooms`, `closedRooms`, `recordingsInProgress`, `roomsExpiringSoon` and an optional `nextExpiringRoom { roomId, roomName, autoDeletionDate }`. The response already is a flat list of counts; `activeRooms` keeps its name beside the two new ones, so the three statuses read the same. A `roomsByStatus` object was rejected because it would leave `activeRooms` outside the group that now contains it, or force a rename of an existing field.

**One count per status, not an aggregation.** Each figure is a `countDocuments` on an indexed field, the shape the service already uses. A single `$group` by status would save two round trips but reads every room in the collection, which grows with the history; the indexed counts read only the keys they report. The single-purpose `countActiveRooms` becomes `countByStatus(status)` so the three statuses share one method.

**`recordingsInProgress` is a status set.** It counts `starting`, `active` and `ending`: a recording that has started and has not yet ended or failed. `complete`, `failed` and `aborted` are never in progress.

**Expiring counts a window that starts now.** The count and the first room use `autoDeletionDate` from now up to now plus `ANALYTICS_EXPIRING_ROOMS_WINDOW` (`7d`, in `INTERNAL_CONFIG`). The sweep reprocesses every room whose date has passed on each run and never clears the date, so a closed room that holds recordings (the default `withRecordings` `close` policy) keeps a past date for good; counting past dates would show it as "next to go" forever. The window therefore has no lower bound other than the clock, read once per request on the answering replica. The clock difference between replicas is seconds against a window of days.

**`nextExpiringRoom` is one read.** The earliest room in the window, ordered by `autoDeletionDate` then `_id` (the order the index has), projecting `roomId`, `roomName` and `autoDeletionDate` only. It is absent from the response when the count is 0.

**Counts are not one snapshot.** The figures are taken in parallel without a transaction, as the existing four are. A room that changes status between two counts can make `openRooms + activeRooms + closedRooms` differ from `totalRooms` by one for that response. The page shows `totalRooms` as the number and sizes the bar from the three status counts, so the bar never exceeds its track and the difference is not visible.

**Frontend.** The component keeps the `MeetAnalytics` signal and derives the bar segments, the relative date and the empty states in the component, not in the template. The segment widths come from the status counts; a status with 0 rooms has no segment. The bar carries an accessible text with the three counts, and every status is also a legend row with its name and count, so colour is not the only carrier. The soonest room's date shows as "today", "tomorrow" or "in N days" from three console translation keys, a language without them shows English, as `localization` specifies. The pulsing dot of a recording in progress stops when the user asks for reduced motion. The room name opens the room detail page through the navigation service, the way the rooms list opens it.

**Several replicas.** Every figure is computed from MongoDB on each request and nothing is cached or held in memory, so any replica answers with the same figures, up to the time they were read.

## Risks / Trade-offs

- **Planner on the status counts.** The status index is shared by the list filter and the sweeps; the counts are covered by it on the seeded data. A future change of that index must keep `status` as its first key.
- **"Expiring" is a date, not a promise of deletion.** A room whose policy is `withRecordings` `close` is closed, not deleted, at its date; the card is titled "Rooms expiring soon" for that reason and says "reach their auto-deletion date".
- **Load.** The overview request now runs six index counts and one read instead of four counts; measured at 1 to 20 ms each in parallel on the seeded data. It is an admin page opened occasionally, not polled.
