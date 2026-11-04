# Tasks

## 1. Keep listeners across a move

- [x] 1.1 Delete the `disconnectedCallback` override that clears the callbacks in `meet-ce/frontend/webcomponent/src/app/custom-element/wrapper.ts`. Invert the case at `tests/unit/wrapper.test.ts` (around line 270): callbacks registered with `on`/`once` still fire after a disconnect and reconnect. Run with `./meet.sh test-unit-webcomponent`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`: "Moving `<openvidu-meet>` to another container dropped the callbacks registered with `on()` and `once()`. They are now kept."
- [x] 2.2 openvidu.io: none.
