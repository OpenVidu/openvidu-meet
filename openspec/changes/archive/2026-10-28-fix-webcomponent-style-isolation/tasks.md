# Tasks

## 1. Keep styles inside the shadow root

- [x] 1.1 Measure in the browser (CDP `getMatchedStylesForNode` on a host element, plus a list of `document.head` `<style>` nodes and of nodes Meet appends outside its shadow root) with the testapp before and after joining and opening a menu; record the findings in the change's design.md and adjust decisions 2 to 4 if they differ.
- [x] 1.2 Remove the `document.head` mirroring from `webcomponent/src/app/shadow-dom/styles.service.ts` (delete the service if nothing else remains) and its wiring in `src/app/app.ts`; verify the meeting, its menus and dialogs still render styled in the testapp.
- [x] 1.3 Provide the shadow-only shared style host in the webcomponent app config and re-host or inline-style what 1.1 found outside the shadow root; verify with `./meet.sh lint-webcomponent` and by checking `document.head` in the testapp holds only the three font links after a meeting.
- [x] 1.4 Add the two scenarios of the delta spec to `meet-ce/frontend/webcomponent/tests/e2e/room.test.ts` (webcomponent transport only; the testapp injects the host `<style>` and the `mat-mdc-button` probe); run `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.
- [x] 1.5 Update the "Shadow DOM" bullet of `meet-ce/frontend/webcomponent/CLAUDE.md` to the new mechanism; verify by reading it against design.md.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "The styles of `<openvidu-meet>` reached the host page, restyling its own elements such as Angular Material components, and the host page's `<style>` rules reached inside the element. Each side's styles now stay on its side of the element's shadow root."
- [x] 2.2 openvidu.io: none. No page describes how the element is styled, and the embedded API reference does not change, so nothing is regenerated.
