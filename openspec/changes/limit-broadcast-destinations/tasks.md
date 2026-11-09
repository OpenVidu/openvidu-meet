# Tasks

Paths are relative to `meet-ce/backend/` unless stated otherwise.

## 1. Resolve destinations in parallel

- [ ] 1.1 In `src/services/broadcast.service.ts` (the destination check around `startBroadcasts`) resolve the hosts of all destinations with `Promise.all` instead of one lookup after the other. Verify in `tests/unit/services/broadcast.service.test.ts`: with three hosts whose lookups each wait on a mocked resolver, the three lookups are in flight together and the first refused host still gives `422`.

## 2. Bound what a meeting streams to (after the decision)

- [ ] 2.1 Once the decision is taken, enforce it in `src/models/zod-schemas/broadcast.schema.ts` (`destinations` of the start body and of `config.broadcast`) and in `startBroadcasts` for the total running in the meeting, answering `422` with a message naming the limit. Verify in `tests/unit/models/broadcast.schema.test.ts` and in `tests/integration/api/meetings/broadcasts.test.ts` (needs the OpenVidu local deployment; report as not run when unavailable): the request one over the limit is refused and starts nothing, the one at the limit starts.
- [ ] 2.2 Reflect the limit in `openapi/broadcasts/` and `openapi/rooms/schemas/meet-room-config.yaml` (`maxItems`, description) and in the destination editors of `shared-meet-components` if the limit is a count.

## 3. Spec

- [ ] 3.1 Update requirements "Room destinations" and "Destinations for one meeting in a start request" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` with the decided limit and a scenario "Destinations over the limit" (WHEN a start request or a config update exceeds it; THEN `422` and nothing starts or is stored). Drop the "Sixth broadcast" scenario if a cap below six is chosen. If `add-live-broadcast` is already archived, write a `MODIFIED` delta in this change and drop `skip_specs`.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0, so its fixes get no line of their own; amend the live broadcast entry only if it states "no limit".
- [ ] 4.2 openvidu.io: state the limit in `docs/meet/features/meetings/live-broadcast.md` (next branch).
