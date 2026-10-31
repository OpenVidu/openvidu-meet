# Tasks

## 1. Update a recording only while it is in progress

- [ ] 1.1 In `meet-ce/backend/src/repositories/recording.repository.ts` (lines 113-115) make the update filter on `{ recordingId, status: { $in: IN_PROGRESS_STATUSES } }`, the filter `finish` uses. In the egress-updated handler (`meet-ce/backend/src/services/livekit-webhook.service.ts`, lines 409-417) send `recordingUpdated` and the in-meeting signal only when the write matched. Verify with the new case "updated after ended" in `meet-ce/backend/tests/unit/services/livekit-webhook.service.test.ts`: status stays final, no webhook, no signal.
- [ ] 1.2 Add to `meet-ce/backend/tests/integration/api/recordings/stale-recordings-gc.test.ts` a late `egress_updated` replay after the end, followed by the clean-up, expecting a single `recordingEnded` (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: none (it makes the existing 3.10.0 line "Its end is now reported like any other, once" true; its wording stays correct).
- [ ] 2.2 openvidu.io: none.
