# Tasks

Paths below are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.

## 1. Keep the choices in the meeting's broadcast state

- [x] 1.1 In `services/broadcast/broadcast-state.service.ts`, hold the ids of the room destinations left out and the destinations given for the meeting (local id, name and full URL, with the counter that numbers their local ids), with methods to toggle a room destination, add a meeting destination and remove one, and clear all of it in `reset()`. Move the `MeetingDestination` type from `broadcast-activity.component.ts` to `models/broadcast.model.ts`. Verify with cases in `services/broadcast/broadcast-state.service.spec.ts`: the choices are kept between reads, a local id is never reused after a removal, and `reset()` clears them.
- [x] 1.2 In `components/panel/activities-panel/broadcast-activity/broadcast-activity.component.ts`, drop `unselectedIds`, `meetingDestinations` and `meetingDestinationCount`, and make `rows()`, `toggleSelected()`, `submitEditor()` and `removeMeetingDestination()` read and change those of `BroadcastStateService`; the component keeps only the editor (`editor`, `editorOpen`, `addingDestination`). Verify in `broadcast-activity.component.spec.ts` (created by `test-broadcast-activity-component`; create it here if this change lands first) that a component created anew lists the room destination left out as unticked and the destination added for the meeting, and that `goLive()` asks for exactly the chosen ones.
- [x] 1.3 Extend the SPA e2e test "should let a room destination be left out but not changed, and go live to one added for the meeting" in `meet-ce/frontend/e2e/broadcasts.test.ts`: untick a room destination and add one for the meeting, open the chat panel, come back to the activity, check both choices are still there, and check Go live streams to the chosen destinations only. Run `./meet.sh test-e2e-frontend` (needs the OpenVidu local deployment; report as not run when unavailable), plus `./meet.sh lint-frontend` and `./meet.sh test-unit-frontend`.

## 2. Spec

- [x] 2.1 Update requirement "Going live from the activity" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md`: the choices hold for the whole meeting entry, whatever panel opens or closes, with a scenario "Choices kept while the panel is closed" (GIVEN a room with destinations A and B and a moderator in its meeting who unticks A and adds destination C for the meeting; WHEN they open the chat and come back to the Live broadcast activity; THEN A is still left out, C is still listed, and going live streams to B and C only). If `add-live-broadcast` is already archived, write it instead as a `MODIFIED` delta of `live-broadcast` in this change and drop `skip_specs`.

## 3. Release surfaces

- [x] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own, and its entry does not describe this behavior.
- [x] 3.2 openvidu.io: none.
