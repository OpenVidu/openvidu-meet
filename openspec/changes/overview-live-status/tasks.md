## 1. Typings

- [ ] 1.1 Add `openRooms`, `closedRooms`, `recordingsInProgress`, `roomsExpiringSoon` and the optional `nextExpiringRoom` (`roomId`, `roomName`, `autoDeletionDate`) to `MeetAnalytics` in `meet-ce/typings/src/analytics.ts`, each with a factual TSDoc, and rebuild the typings.

## 2. Backend

- [ ] 2.1 Add `ANALYTICS_EXPIRING_ROOMS_WINDOW` (`'7d'`) to `INTERNAL_CONFIG`.
- [ ] 2.2 `RoomRepository`: replace `countActiveRooms` with `countByStatus(status)`, add `countExpiringRooms(from, until)` and `findNextExpiringRoom(from, until)` (only `roomId`, `roomName` and `autoDeletionDate`).
- [ ] 2.3 `RecordingRepository`: add `countInProgress()` counting `starting`, `active` and `ending`.
- [ ] 2.4 `AnalyticsService.getAnalytics` returns the new figures in the same parallel batch, leaving `nextExpiringRoom` out when no room expires.
- [ ] 2.5 Update `openapi/analytics/schemas/meet-analytics.yaml` with the five fields and their examples; validate with `pnpm run lint:api`.
- [ ] 2.6 Unit test `AnalyticsService` (new `tests/unit/services/analytics.service.test.ts`): the window bounds, `nextExpiringRoom` present and absent, the figures passed through.
- [ ] 2.7 Extend `tests/integration/api/analytics/get-analytics.test.ts`: structure and zero values, rooms by status, recordings in progress against `complete`, `failed` and `aborted`, a room expiring in two days, one in ten days, one without a date, and a past date kept by the `close` policy. Report it as not run when the OpenVidu local deployment is not available.

## 3. Console

- [ ] 3.1 Add the overview texts to `domains/console/lang/` in every language file (en, es, cn, de, fr, hi, it, ja, nl, pt): the three room statuses, recordings in progress and idle, the expiring card title, detail, "next to go", "today", "tomorrow", "in N days", the empty message, the "View rooms" action, "Refresh", "Updated {time}" and the error notice ("The figures could not be updated"). Check that the translate pipe interpolates the number of days.
- [ ] 3.2 Rework `overview.component` (`.ts`, `.html`, `.scss`) to the approved design: status bar and legend in the rooms card, recordings in progress or idle state in the recordings card, the expiring card with the soonest room opening its detail page, "View rooms" opening the Rooms list. Use the design tokens and keep the existing element ids.
- [ ] 3.3 Refresh in `overview.component`: `OVERVIEW_REFRESH_INTERVAL_MS` (30 seconds), a timer that runs only while the tab is visible and is removed with the component, a request on every change to visible, a Refresh action, the time of the last successful reading, no overlapping requests, the figures kept on screen while reloading, and an error notice that keeps the last figures. The getting-started view is shown only for figures that were read and are all zero.
- [ ] 3.4 Unit test the overview component (new `overview.component.spec.ts`, with a fake clock and a stubbed visibility state): the three states of each card, the segment widths with a status at 0, the relative date, and the soonest room's navigation; the request every 30 seconds, none while hidden and one on becoming visible, a Refresh click, a click while a request runs, the figures kept while reloading, a failed reload keeping the last figures and time, a failed first request showing the notice and not the getting-started view, and a fresh deployment still showing it.
- [ ] 3.5 Run `./meet.sh test-unit-frontend`, `./meet.sh lint-frontend` and `pnpm run test:types` in the backend.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`: one line under 3.10.0, Added > UI, for the overview's rooms by status, recordings in progress, rooms expiring soon and periodic refresh, and one line under Fixed > UI saying that a failed request showed the getting-started view and that the overview now keeps its figures and shows an error notice.
- [ ] 4.2 openvidu.io: no page describes the overview or `getAnalytics`; nothing to update on `next`.
- [ ] 4.3 `npx openspec archive overview-live-status --yes` in the implementing pull request, then `npx openspec validate --all --strict`.
