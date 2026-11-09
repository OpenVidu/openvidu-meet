# Tasks

## 1. Remove the inert option

- [ ] 1.1 In `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/services/screen-share/screen-share.service.ts` (line 93) delete `suppressLocalAudioPlayback: true` and its comment. Verify with the existing screen sharing unit spec of that service and the audio checks of `meet-ce/frontend/e2e/screensharing.test.ts` (Playwright, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: none (no observable change, and screen-share audio is new in 3.10.0).
- [ ] 2.2 openvidu.io: none.
