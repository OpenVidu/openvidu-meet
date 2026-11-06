## Context

The overview (`overview-live-status`, unreleased 3.10.0) builds the rooms bar in its template:
- `roomSegments` is a computed list of `{ key, count, label }`.
- The template draws one flex segment per non-zero count, and a legend row per status with id `rooms-status-<key>`.
- The segment colors are classes `status-<key>`.

The recordings card shows two pieces of text in the card body: `completeRecordings` as a detail line, and `recordingsInProgress` as a live row (pulsing dot, LIVE badge, idle state).

`getAnalytics` computes every figure in one parallel batch of MongoDB counts. The recording status index already serves `countCompleteRecordings` and `countInProgress`, which are COUNT_SCAN reads that take 1 to 20 ms on 500,000 recordings.

## Goals / Non-Goals

**Goals:**
- One bar and legend markup shared by both cards, so they cannot drift apart.

**Non-Goals:**
- A reusable bar component outside the overview. Nothing else in the console needs one.
- Linking a legend row to the Recordings list filtered by that status. The rooms legend does not link either.

## Decisions

**The bar becomes an `ng-template` used by both cards.** The rooms markup moves into `<ng-template #statusBreakdown let-breakdown let-idPrefix="idPrefix">`, and each card renders it with `ngTemplateOutlet`.
- The rooms legend keeps its ids `rooms-status-<key>`.
- The recordings legend gets `recordings-status-<key>`.
- The alternative was a child component. It would bring its own inputs, styles and spec for a few lines of markup used by one page. The template keeps the change inside the component, and the existing `status-*` styles apply unchanged.

**Each card gets a breakdown computed the same way.** `roomBreakdown` and `recordingBreakdown` each return:
- the segments (key, count and legend text);
- the bar's accessible label key;
- the label params, built from the segment keys and counts.

The template therefore takes one object and no per-card label expression. The recordings keys are `available`, `progress` and `failed`, with counts `completeRecordings`, `recordingsInProgress` and `failedRecordings`. Each segment's color is a class `status-<key>`:
- `status-available`: `--ov-meet-color-success`.
- `status-progress`: `--ov-meet-color-primary`.
- `status-failed`: `--ov-meet-color-error`.

**`failedRecordings` is counted, not derived.** `RecordingRepository.countFailed()` counts statuses `failed`, `aborted` and `limit_reached`, in the same parallel batch as the other figures. Deriving it as `total - complete - inProgress` is wrong when a recording changes status between the counts, since they are separate reads and not one snapshot. In that case the difference can go negative. The status list sits next to `countInProgress`, which already holds the in-progress statuses.

**The live row, its LIVE badge and the detail line are removed.** Their styles (`.live-status`, `.live-dot`, `.idle-dot`, `.live-badge`, the pulse animation and its reduced-motion rule) and their texts go too:
- `AVAILABLE_PLAYBACK_SUFFIX`;
- `RECORDINGS_IN_PROGRESS`;
- `NO_RECORDING_IN_PROGRESS`;
- `LIVE`.

The new texts are:
- `RECORDINGS_STATUS_AVAILABLE`, `RECORDINGS_STATUS_PROGRESS` and `RECORDINGS_STATUS_FAILED`;
- `RECORDINGS_BAR_LABEL`, with `{available}`, `{progress}` and `{failed}`.

The keys are added to all ten console language files.

## Risks / Trade-offs

- [The live signal is less prominent: a running recording no longer pulses] → It appears as the blue in-progress segment and its legend count, which is how the rooms card already shows a meeting in progress. The user asked for that homogeneity.
- [A bar of recordings that is mostly failed reads alarming on a test deployment] → It is the real state. The legend carries the counts, so a reader can see the absolute numbers.

With several replicas, every figure is read from MongoDB on request, so any replica answers the same. There is no new persisted field, so no migration is needed.
