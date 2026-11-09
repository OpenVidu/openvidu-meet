# Tasks

Paths below are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/`.

## 1. Price each destination at its encoding

- [ ] 1.1 In `shared/models/broadcast.model.ts`, replace `BROADCAST_MBPS_PER_DESTINATION` with a function that gives one destination's upload from a `MeetRecordingEncodingPreset` (the preset's video bitrate plus 128 kbps of audio) or `MeetRecordingEncodingOptions` (`video.bitrate + audio.bitrate`), and make `broadcastUploadMbps()` take the encoding with the number of destinations.
- [ ] 1.2 In `domains/rooms/pages/room-wizard/steps/broadcast-config/broadcast-config.component.ts`, price the destinations at the room's `config.broadcast.encoding` as the wizard state holds it (`domains/rooms/services/wizard-state.service.ts`: the stored one in edit mode, `H264_720P_30` when creating). In `domains/rooms/lang/*.json`, drop "at 720p" from `ROOMS.WIZARD.BROADCAST.COST_NOTE` in every locale.
- [ ] 1.3 In `domains/meeting/openvidu-components/components/panel/activities-panel/broadcast-activity/broadcast-activity.component.ts`, compute `mbpsPerDestination` and `plannedMbps` from `MeetingContextService.broadcastConfig()` encoding and `liveMbps` from the `encoding` of the live broadcasts; check the `COST_NOTE`, `COST_NOTE_ONE` and `UPLOAD_ESTIMATE` strings of `domains/meeting/lang/*.json` name no resolution.
- [ ] 1.4 Verify: in `broadcast-activity.component.spec.ts` (created by `test-broadcast-activity-component`; create it here if this change lands first), a room encoded `H264_1080P_60` with two chosen destinations shows 6 Mbps each and 12 in total, and a live broadcast with encoding options of 8000 kbps video and 128 kbps audio shows 8 Mbps; in the edit-mode case of `meet-ce/frontend/e2e/room-wizard.test.ts`, a room created through the REST API with `H264_1080P_60` shows 6 Mbps per destination. Run `./meet.sh test-unit-frontend`, `./meet.sh lint-frontend` and `./meet.sh test-e2e-frontend` (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Spec

- [ ] 2.1 Update requirements of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md`: in "Going live from the activity", the upload shown follows the room's `broadcast.encoding`, with a scenario "Upload at 1080p" (GIVEN a room whose `broadcast.encoding` is `H264_1080P_60` with two destinations; WHEN a moderator opens the Live broadcast activity; THEN it shows about 12 Mbps of upload for both); in "Live broadcast in the room wizard", the step shows the upload the destinations need at the room's encoding. If `add-live-broadcast` is already archived, write these instead as a `MODIFIED` delta of `live-broadcast` in this change and drop `skip_specs`.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own, and its entry does not describe this behavior.
- [ ] 3.2 openvidu.io: in `docs/meet/features/meetings/live-broadcast.md`, "Server upload" note, say the upload per destination follows the room's broadcast encoding: about 3 Mbps at the default 720p, up to about 6 Mbps at 1080p and 60 fps.
