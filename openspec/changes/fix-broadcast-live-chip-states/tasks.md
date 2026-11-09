# Tasks

Paths below are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.

## 1. Starting only before media, time until the end

- [ ] 1.1 In `services/broadcast/broadcast-state.service.ts`, make `trackElapsed()` clock from the broadcasts `active` or `ending` that carry a `startDate`, and expose whether that clock runs (the meeting is on air), leaving `isStarting` as the activity reads it. Verify in `services/broadcast/broadcast-state.service.spec.ts`: the clock keeps running while the last broadcast is `ending` and stops once it ends (adjust "stops the clock with the last live broadcast"), and it does not start for an `ending` broadcast without `startDate`.
- [ ] 1.2 In `components/status-rail/status-rail.component.ts` and `.html`, show the Starting label only while nothing is on air and a broadcast is starting or a start is pending, the time while on air, and no label otherwise. Verify by extending "shows the broadcast chip while live, folding its label while it is still starting" in `components/status-rail/status-rail.component.spec.ts`: one destination on air and another starting shows the time, and only an ending broadcast that never went live shows LIVE without a time. Run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.

## 2. Spec

- [ ] 2.1 Add to requirement "Live status shown to every participant" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` the scenarios "Another destination starting while live" (GIVEN a meeting live to destination A for one minute; WHEN a moderator starts destination B; THEN the mark keeps showing the time since A went live) and "Last destination stopping" (GIVEN a meeting whose only broadcast is live; WHEN it is stopped; THEN the mark keeps counting until the broadcast ends and then disappears). If `add-live-broadcast` is already archived, write them instead as a `MODIFIED` delta of `live-broadcast` in this change and drop `skip_specs`.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own, and its entry does not describe this behavior.
- [ ] 3.2 openvidu.io: none.
