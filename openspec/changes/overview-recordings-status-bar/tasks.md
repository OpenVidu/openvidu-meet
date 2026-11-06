## 1. Typings and backend

- [x] 1.1 Add `failedRecordings` to `MeetAnalytics` in `meet-ce/typings/src/analytics.ts` with a factual TSDoc ("Number of recordings whose status is `failed`, `aborted` or `limit_reached`"). Done when `./meet.sh build-typings` passes.
- [x] 1.2 Add `RecordingRepository.countFailed()` for statuses `failed`, `aborted` and `limit_reached`, next to `countInProgress()`, and return it as `failedRecordings` from the same parallel batch in `AnalyticsService.getAnalytics`. Done when `npx tsc --noEmit` passes in `meet-ce/backend`.
- [x] 1.3 Add `failedRecordings`, with its description and example, to `meet-ce/backend/openapi/analytics/schemas/meet-analytics.yaml`. Done when `pnpm run lint:api` passes in the backend.
- [x] 1.4 Extend `tests/unit/services/analytics.service.test.ts` so `failedRecordings` is passed through. Done when `pnpm run test:unit` and `pnpm run test:types` pass in the backend.
- [x] 1.5 Extend `tests/integration/api/analytics/get-analytics.test.ts`:
  - the response structure lists `failedRecordings`, and it is 0 on an empty deployment;
  - a `complete`, a `failed`, an `aborted` and a `limit_reached` recording give `failedRecordings` 3 and `recordingsInProgress` 0, and the three figures add up to `totalRecordings`.

  Run it against an isolated backend, or report it as not run when the OpenVidu local deployment is not available.

## 2. Console overview

- [x] 2.1 In every console language file (`domains/console/lang/`: en, es, cn, de, fr, hi, it, ja, nl, pt):
  - add `OVERVIEW.RECORDINGS_STATUS_AVAILABLE`, `OVERVIEW.RECORDINGS_STATUS_PROGRESS`, `OVERVIEW.RECORDINGS_STATUS_FAILED` and `OVERVIEW.RECORDINGS_BAR_LABEL` (`{available}`, `{progress}`, `{failed}`);
  - remove `AVAILABLE_PLAYBACK_SUFFIX`, `RECORDINGS_IN_PROGRESS`, `NO_RECORDING_IN_PROGRESS` and `LIVE`.

  Done when every file has the same `OVERVIEW` keys as `en.json`.
- [x] 2.2 In `overview.component.html`, move the rooms bar and legend into an `ng-template` and render it in both cards. Legend ids: `rooms-status-<key>` and `recordings-status-<key>`.
- [x] 2.3 In `overview.component.ts`, replace `roomSegments` with `roomBreakdown` and add `recordingBreakdown`. Each returns the segments, the bar label key and its params. The recordings keys are `available`, `progress` and `failed`.
- [x] 2.4 In `overview.component.html` and `.scss`, remove from the recordings card the detail line, the `#recordings-in-progress` row and their styles.
- [x] 2.5 In `overview.component.scss`, add `status-available` (success), `status-progress` (primary) and `status-failed` (error).

  Done for 2.2 to 2.5 when the library builds and the page shows both cards with the same bar layout in light and dark theme.
- [x] 2.6 Update `overview.component.spec.ts`:
  - the recordings legend counts;
  - a recordings bar with only the available segment while its legend still lists the other two with 0;
  - the bar's accessible label.

  Remove the expectations on the live row. Done when `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend` pass.

## 3. Release surfaces

- [x] 3.1 `CHANGELOG.md`: amend the existing 3.10.0 `Added > UI` overview line so it says the overview shows the recordings by status (available for playback, in progress and failed), and lists `failedRecordings` among the `getAnalytics` fields. The overview is unreleased, so this change gets no line of its own.
- [x] 3.2 openvidu.io: no page describes the overview or `getAnalytics`, so no text changes. The overview videos (`docs/assets/videos/meet/users/overview/login-{light,dark}.mp4`) end on the getting-started view of an empty deployment and never show the recordings card, so they are not recaptured.

## Workflow follow-up

- `npx openspec archive overview-recordings-status-bar --yes` in the implementing pull request, then `npx openspec validate --all --strict`.
