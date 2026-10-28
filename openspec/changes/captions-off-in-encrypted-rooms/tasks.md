# Tasks

## 1. Server rule

- [x] 1.1 Turn `captions.enabled` off when `e2ee.enabled` is on in the room create schema, next to the recording rule; verify with a case in `meet-ce/backend/tests/integration/api/rooms/e2ee-room-config.test.ts` creating a room with both on and reading `captions.enabled: false`.
- [x] 1.2 Apply the same rule to the merged config in the room config update path; verify in `e2ee-room-config.test.ts` (encryption turned on later) and `meet-ce/backend/tests/integration/api/rooms/update-room-config.test.ts` (captions turned on in an encrypted room stays off).
- [x] 1.3 Add the room migration v7 -> v8 that turns captions off in encrypted rooms, bump `ROOM_SCHEMA_VERSION` and its `MIGRATION_REV`; verify with a case in `meet-ce/backend/tests/integration/api/rooms/room-migrations.test.ts` and keep `meet-ce/backend/tests/unit/services/migration.service.test.ts` passing. Report the integration suites as not run if the local deployment is unavailable.
- [x] 1.4 Extend the `MeetE2EEConfig.enabled` description in `meet-ce/backend/openapi/rooms/schemas/meet-room-config.yaml` ("Enabling E2EE will disable the recording feature") to live captions, and say the same in the `captions` description; verify with `pnpm run lint:api`.

## 2. Room wizard

- [x] 2.1 Make the wizard turn the captions toggle off and disable it while encryption is on, restoring its previous value when encryption is turned off, alongside the recording handling in the wizard state service; verify with a test in `meet-ce/frontend/e2e/room-wizard.test.ts`; report it as not run if the local deployment is unavailable.
- [x] 2.2 Warn about it as the wizard does for recording: in the Meeting step, add a "Live captions are unavailable while encryption is enabled." item to the E2EE restrictions card next to the recording one (`ROOMS.WIZARD.MEETING.E2EE_RESTRICTION_CAPTIONS_*`), and show a warning under the disabled captions toggle while encryption is on, styled like the Recording step's `E2EE_WARNING_*` notice; translate the new keys in the ten `lib/domains/rooms/lang/*.json` files; verify both texts in the 2.1 test.

## 3. Release surfaces

- [x] 3.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "- A room with end-to-end encryption could have live captions on, although the captions assistant only receives encrypted audio and produced no captions. As with recording, `captions.enabled` is now stored as `false` while `e2ee.enabled` is `true`, in existing rooms too, and the room wizard turns captions off when encryption is turned on."
- [ ] 3.2 openvidu.io `next`, `docs/meet/features/meetings/e2e-encryption.md`: add a **Live captions are not available** bullet to the "E2EE Limitations" warning next to the recording one, and refresh the `room-wizard-e2ee` light and dark screenshots, which now show the captions restriction.
- [x] 3.3 openvidu.io `next`, `docs/meet/features/meetings/live-captions.md`: add an `!!! info` notice, like the one in `docs/meet/features/recordings/configuration.md`, saying live captions and end-to-end encryption are mutually exclusive.
