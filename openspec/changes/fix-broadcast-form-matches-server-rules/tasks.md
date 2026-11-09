# Tasks

Frontend paths below are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/`.

## 1. One rule for the server and the form

- [ ] 1.1 In `meet-ce/typings/src/database/room-config.ts`, export `MEET_BROADCAST_DESTINATION_URL_MAX_LENGTH` (2048) next to `MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH` and a helper giving the stream key of a destination URL (what follows the last `/`, without ` live=1`), each with a concise TSDoc. In `meet-ce/backend/src/models/zod-schemas/broadcast.schema.ts`, use the constant instead of `DESTINATION_URL_MAX_LENGTH`; in `meet-ce/backend/src/helpers/broadcast.helper.ts`, replace the private `streamKeyOf()` with the typings helper. Verify with cases for the helper in `meet-ce/backend/tests/unit/typings/broadcast-stream-url.test.ts` (query string kept, ` live=1` dropped), and with `broadcast-schemas.test.ts` and `broadcast.helper.test.ts` still passing; run `./meet.sh build-typings`, `./meet.sh test-unit-backend` and `./meet.sh lint-backend`.

## 2. The destination form refuses what the server refuses

- [ ] 2.1 In `shared/utils/broadcast-destination-editor.ts`, replace `Validators.required` on the name with a check that rejects a name empty once trimmed, add `Validators.maxLength(MEET_BROADCAST_DESTINATION_URL_MAX_LENGTH)` to the URL, and add a validator that rejects a URL whose stream key one of the other destinations' full URLs already has, fed through `open()` with those URLs (redacted ones are left out). Verify with cases in `shared/utils/broadcast-destination-editor.spec.ts`: a name of spaces, a URL of 2049 characters and a repeated stream key on another host are refused, and a destination edited with its own URL is not taken for a duplicate of itself.
- [ ] 2.2 Pass the other destinations' URLs from `domains/rooms/pages/room-wizard/steps/broadcast-config/broadcast-config.component.ts` (the wizard's list) and from `domains/meeting/openvidu-components/components/panel/activities-panel/broadcast-activity/broadcast-activity.component.ts` (the destinations this client gave for the meeting), and show the URL-too-long and repeated-key messages in both templates, with the new keys in every locale of `domains/rooms/lang/` and `domains/meeting/lang/`.
- [ ] 2.3 Add a case to the edit-mode tests of `meet-ce/frontend/e2e/room-wizard.test.ts`: a destination named only with spaces cannot be saved and the editor shows the name error. Run `./meet.sh test-unit-frontend`, `./meet.sh lint-frontend` and `./meet.sh test-e2e-frontend` (needs the OpenVidu local deployment; report as not run when unavailable).

## 3. Spec

- [ ] 3.1 Update requirements of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md`: in "Live broadcast in the room wizard", the editor refuses what the server would, with a scenario "Destination the server would refuse" (WHEN the user gives a destination a name of only spaces, a URL longer than 2048 characters, or the stream key of another destination they typed; THEN the editor shows why and does not add it); in "Destinations added in the meeting", the same rule for a destination added for the meeting. If `add-live-broadcast` is already archived, write these instead as a `MODIFIED` delta of `live-broadcast` in this change and drop `skip_specs`.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own, and its entry does not describe this behavior.
- [ ] 4.2 openvidu.io: none (the typings exports are not part of the embedded API reference, and the REST API keeps its rules).
