# Tasks

## 1. Settle the scope of the shortcuts

- [x] 1.1 Record the answers to both decisions in `proposal.md` (Option A; `F11` included) and delete the groups below that no longer apply.
- [x] 1.2 Add the deltas the decision calls for: `raise-hand` "Raise hand from the toolbar and the keyboard" and `reactions` "Reaction keyboard shortcuts" (a scenario with the focus on a host page button inside `<openvidu-meet>`), and `meeting-layout`'s fullscreen requirement; remove `skip_specs: true` from `.openspec.yaml` and verify with `npx openspec validate fix-webcomponent-shortcuts-scope --strict`.

## 2. Keys only from inside the element

- [x] 2.1 Give `isShortcut` in `keyboard-shortcut.utils.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/utils/`) the meeting's root node as a second argument and accept only events whose `composedPath()` contains it: the element's shadow root inside `<openvidu-meet>`, the document in the iframe and the standalone app, so no mode branch is needed. Pass the meeting's root node from `onHandShortcut` (`meeting-toolbar-extra-buttons.component.ts`) and from `onShortcut` and `pickerKeydown` (`meeting-toolbar-reactions-button.component.ts`), and from the `F11` listener of `toolbar.component.ts` (through `isMeetingKey`, which keeps F11 free of the typing and modifier checks); the picker overlay already lives in the shadow root.
- [x] 2.2 Make the meeting focusable (`tabindex="-1"` on the root of `meeting-view.component.html`, no visible outline) so a click on the video grid or any non-focusable part of the meeting moves the focus inside the element.
- [x] 2.4 Read the root from the meeting page (`MeetingShortcutsService`, provided by `ov-meeting`), not from the button's own element: a compact toolbar keeps the hand and reaction buttons in its closed More options menu, out of the page, where their own root is not the meeting's and every key was refused. Verified in `keyboard-shortcut.utils.spec.ts` and in a `room.test.ts` case at 700 px.
- [x] 2.3 Verify in `meet-ce/frontend/webcomponent/tests/e2e/room.test.ts`, next to "should leave every key typed in the chat to the chat, the meeting shortcuts included": with the focus on a host page button, `r` and `e` change nothing (`#raise-hand-button` stays inactive, no picker); after a click on the meeting, `r` raises the hand. Run `./meet.sh test-e2e-webcomponent` and the `R`/`E` cases of `meet-ce/frontend/e2e/participants.test.ts` with `./meet.sh test-e2e-frontend` (both need the OpenVidu local deployment; report as not run when unavailable), plus `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.

## 3. Release surfaces

- [x] 3.1 `CHANGELOG.md`, under `## 3.10.0 (unreleased)`: no line for `R`, `E` and the digits (raise hand and reactions are new in 3.10.0). For `F11`, under `### Fixed` > `#### Integration`: "Inside `<openvidu-meet>`, `F11` pressed anywhere on the host page was taken by the meeting, and the browser did not toggle its own fullscreen. The meeting now takes it only with the focus inside the element."
- [x] 3.2 openvidu.io `docs/meet/features/meetings/raise-hand.md` and `docs/meet/features/meetings/reactions.md` (branch `next`): the sentences "press the `R` key anywhere outside a text field" and "press `E` anywhere outside a text field" say where the keys work inside an embedded Web Component.
