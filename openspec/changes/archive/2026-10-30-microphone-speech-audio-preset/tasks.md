# Tasks

Paths are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/` unless they start with `meet-ce/`.

## 1. Publish the microphone at speech quality

- [x] 1.1 In `services/local-media/local-media.service.ts`, publish the microphone track with `{ audioPreset: AudioPresets.speech }` and the camera track as today, at the single `publishTracks` call; leave the Room's `publishDefaults`, RED and DTX untouched. Verify in `services/local-media/local-media.service.spec.ts` that joining publishes the microphone with the speech preset and the camera without publish options, and that `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend` pass.
- [x] 1.2 Add a test to `meet-ce/frontend/e2e/media-devices.test.ts` that joins a meeting, shares the screen and reads the audio senders' `maxBitrate`: the microphone's is 24000 and the screen-share audio's is not capped at 24000. Run it with Playwright (`spa` project) against the local deployment, or report it as not run when unavailable.
- [x] 1.3 Delete the unused `models/media-profile.model.ts`; verify nothing in CE or `meet-pro/` references `MediaProfile`, `DEFAULT_MEDIA_PROFILE` or `MEDIA_PROFILE_OVERRIDE_KEY`, and that the library build (`lib:build`) and the app build pass.
- [x] 1.4 Measure a 1:1 meeting and a 1:1 meeting with a lossy downlink with the WebRTC audit harness (`../openvidu-meet-webrtc-audit`) on a production build of this branch: a speaker sends about 47 kbps and an open silent microphone about 26 kbps, RED keeps concealed audio at 0% with 3% loss, and a shared tab's audio keeps its previous bitrate.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: add to 3.10.0 `Improved` > `UI` that the microphone is sent at speech quality, 24 kbps instead of 48 kbps.
- [x] 2.2 openvidu.io: none (no page documents the audio bitrate).

## Workflow follow-up

- Run `/opsx:archive` inside the pull request before merging, then `npx openspec validate --all --strict`.
