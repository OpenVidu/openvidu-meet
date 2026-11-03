# Tasks

Paths are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/` unless they start with `meet-ce/`.

## 1. Take both picks when Apply is pressed

- [x] 1.1 In `services/device-trial/device-trial.service.ts`, make `apply()` read `camera.device()` and `microphone.device()` and call `discard()` on both before its first `await`, then switch and remember each picked device in turn (`switchCamera` then `setCameraSelected`, `switchMicrophone` then `setMicSelected`); `applyOne` receives the picked device instead of the `TriedDevice`, so nothing is read after the camera switch. `pending` also holds while `applying()`, so the button stays disabled until the switches end. Verify in `device-trial.service.spec.ts` (`applying`): with `switchCamera` held on a deferred promise, calling `ngOnDestroy()` before it resolves still switches and remembers the picked microphone; the existing `applying` cases keep passing. Run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.
- [x] 1.2 No e2e is added: with fake devices the camera switch resolves before a panel close can land, so the race is covered by 1.1, and the happy path by the existing "picked microphone and camera both published after one Apply" test of `meet-ce/frontend/e2e/media-devices.test.ts`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. The device trial (#143) is new in 3.10.0, and its settings panel entry already says that Apply switches the picked devices.
- [x] 2.2 openvidu.io: none.
