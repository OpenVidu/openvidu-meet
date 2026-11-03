# Tasks

## 1. Wizard

- [ ] 1.1 In `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/rooms/pages/room-wizard/steps/meeting-config/meeting-config.component.ts`, move the captions rule from the encryption toggle's `(change)` handler to the `valueChanges` of the encryption control (or to `updateStepData`), so `patchValue` from `recording-config.component.ts` triggers it, restoring captions when encryption turns off. Verified in `room-wizard.component.spec.ts` or the existing step specs: captions on, encryption on, recording enabled in the Recording step, recording disabled again, and the form shows captions on and enabled at the end.
- [ ] 1.2 e2e: in `meet-ce/frontend/e2e/room-wizard.test.ts`, the same path ends with a room created with captions on. Needs the OpenVidu local deployment; report as not run when unavailable.

## 2. Backend rule once

- [ ] 2.1 Apply the encryption exclusion in `createMeetRoom` and `updateMeetRoomConfig` of `meet-ce/backend/src/services/room.service.ts` and remove it from both transforms of `meet-ce/backend/src/models/zod-schemas/room.schema.ts`. Verified in `tests/unit/services/room.service.test.ts`: a direct `createMeetRoom` with encryption and captions stores captions off, and `updateMeetRoomConfig` keeps the results of the room-config scenarios; the integration room tests stay green (needs the OpenVidu local deployment; report as not run when unavailable).

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: no new line. The wizard line of 3.10.0 (captions turned off with encryption) becomes true on every path; check its wording.
- [ ] 3.2 openvidu.io: none.
