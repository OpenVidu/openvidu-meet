# Tasks

Paths below are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/rooms/pages/room-wizard/steps/broadcast-config/`.

## 1. Edit the destination the editor was opened on

- [ ] 1.1 In `broadcast-config.component.ts`, replace `editingIndex` and the `NOT_EDITING` and `NEW_DESTINATION` constants with the destination being edited (or a marker for a new one); `openEdit()` takes the destination, `submitDestination()` replaces that destination in the list, and `removeDestination()` removes by destination and closes the editor only when it removes the one being edited. In `broadcast-config.component.html`, show the editor on the row whose destination is the one being edited instead of comparing `$index`, and pass the destination to Edit and Remove.
- [ ] 1.2 Add an edit-mode case to `meet-ce/frontend/e2e/room-wizard.test.ts`: a room with destinations A, B, C and D (C and D on the same host), edit C, rename it, remove A, save the editor and finish; the stored room keeps B and D unchanged and C renamed with its stream key. In the same case, start editing D, remove B, and check the editor stays open on D and Add comes back once it is saved. Run `./meet.sh test-e2e-frontend` (needs the OpenVidu local deployment; report as not run when unavailable), plus `./meet.sh lint-frontend`.

## 2. Spec

- [ ] 2.1 Update requirement "Live broadcast in the room wizard" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` with a scenario "Row removed while another is edited" (GIVEN a room with destinations A, B and C open in the wizard; WHEN its owner edits C, removes A, renames C, saves the editor and finishes; THEN the room keeps B unchanged and C under the new name with its stream key). If `add-live-broadcast` is already archived, write it instead as a `MODIFIED` delta of `live-broadcast` in this change and drop `skip_specs`.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own, and its entry does not describe this behavior.
- [ ] 3.2 openvidu.io: none.
