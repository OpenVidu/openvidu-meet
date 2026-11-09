# Tasks

## 1. Device setup microphone level

- [x] 1.0 Turn the device setup camera, microphone and background effects controls into split controls (rounded frame, borderless toggle, menu button; background effects stays a single button), with separate accessible names for toggling and choosing. Verify with Karma specs (toggle does not open the menu, menu does not toggle) and the SPA e2e cases that drive these controls.
- [x] 1.1 In the microphone toggle, add a fill layer clipped by its rounded corners and bound to `MicActivityService.level` through `scaleY`, hidden while the microphone is off or muted by the system, with the menu arrow outside it. Add "picking up sound" to the accessible name above the speaking threshold, debounced. Verify with a Karma spec of the control (level drives the fill, hidden when off or system muted, menu part never fills) and `./meet.sh lint-frontend`.
- [ ] 1.2 Check by hand on the device setup screen, in the SPA and in the web component: speaking moves the fill, muting hides it, changing microphone follows the new one.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: under the unreleased release, Added > UI: the device setup screen shows the microphone's live level in its microphone button.
- [x] 2.2 openvidu.io: none.

## Workflow follow-up

- Archive with `/opsx:archive` inside the pull request once every task is done, then run `npx openspec validate --all --strict`.
- Independent of any other change.
