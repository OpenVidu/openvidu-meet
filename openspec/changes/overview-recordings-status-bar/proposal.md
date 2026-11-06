## Why

The overview's rooms card shows its rooms by status in a proportional bar with a legend, but the recordings card shows a count of recordings available for playback and a separate in-progress row, and says nothing about the recordings that failed. The two cards read differently, and an administrator has to open the Recordings list and filter by status to notice failed recordings.

## What Changes

- The recordings card shows its recordings by status in the same kind of bar and legend as the rooms card. It has three segments:
  - **Available for playback**: `complete`.
  - **In progress**: `starting`, `active` or `ending`.
  - **Failed**: `failed`, `aborted` or `limit_reached`.
  These are the same three groups the Recordings list already uses to decide what can be played and what shows as an error. The three counts add up to the total.
- The recordings card drops the "N available for playback" line and the in-progress row with its LIVE badge. Their figures move into the legend, as the rooms card shows "in a meeting now".
- `getAnalytics` returns one more figure, `failedRecordings`. The bar does not derive it as the total minus the other two: the counts are read in parallel and are not one snapshot, so a recording that finishes between two counts could make the difference wrong or even negative.

Assumptions recorded here instead of asked:

- `limit_reached` counts as failed, as it does on the Recordings list. A recording stopped by the duration limit cannot be played from the console today.
- The segment colors are:
  - available: the success color, as "open" rooms;
  - in progress: the primary color, as "in a meeting now";
  - failed: the error color.
- The overview stays admin only, and its refresh behavior does not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`:
  - The overview requirement shows the recordings by status in a bar and legend, like the rooms.
  - The analytics requirements answer and define `failedRecordings`.

## Impact

- **Internal REST API** (`getAnalytics`, `/internal-api/v1/analytics`): one new field in the response, added without changing the others. The internal API carries no compatibility promise. The public REST API, webhooks and embedded API are untouched.
- **Console UI**:
  - The recordings card of the overview changes.
  - New console translations for the failed segment and the bar's accessible label. Two texts are removed: the playback suffix and the in-progress row.
- **Typings**: `MeetAnalytics` gains `failedRecordings`, with TSDoc.
- **Backend**: one more MongoDB count by recording status, served by the existing status index. No persisted field, no migration and no new index.
- **Several replicas**: the figure is computed from MongoDB on request, so no replica holds state.
- **CHANGELOG.md**: the overview is unreleased (3.10.0), so its existing `Added > UI` line is amended instead of adding a new one.
- **openvidu.io**: no page describes the overview or the analytics endpoint, so none changes. The overview videos on `next` end on the getting-started view of an empty deployment and never show the recordings card.
- **CE extension seam**: none needed.
