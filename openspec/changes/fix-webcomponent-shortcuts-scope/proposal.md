# Proposal

## Why

Inside `<openvidu-meet>`, the meeting reads its single-key shortcuts from the whole host page: `R` raises or lowers the hand, `E` opens the reaction picker, and while it is open `1` to `8` send a reaction, wherever the focus is outside a text field. A host application with its own single-key shortcuts (a helpdesk where `R` replies, a whiteboard where `R` draws a rectangle and digits pick tools) raises the participant's hand in front of everyone and sends reactions every time its user presses them. The iframe and the standalone app are not affected: the meeting has its own document there.

## What Changes

Depending on the decision below:

- Option A: inside `<openvidu-meet>`, `R`, `E` and `1` to `8` act only when the key is pressed with the focus inside the element. A click anywhere in the meeting, not only on a button, puts the focus inside it, so the shortcuts work after clicking the video grid. The iframe and the standalone app keep today's behavior.
- Option B: the shortcuts keep listening on the whole page, and a new embedded attribute (and URL parameter for the iframe) lets the host turn them off, on by default.

Options A and B can also be combined. Either way the `F11` fullscreen key, which the meeting has read from the whole host page since earlier releases, follows the same rule as the other shortcuts (see the decisions below).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None yet (`skip_specs: true` until the decision). Once decided, task 1.2 adds the deltas: `raise-hand` "Raise hand from the toolbar and the keyboard", `reactions` "Reaction keyboard shortcuts" and, if `F11` follows, `meeting-layout` (its fullscreen requirement naming `F11`); under Option B also `embedded-api` for the new attribute.

## Impact

- Embedded API: Option A changes no contract. Option B adds an attribute (additive, with its typings TSDoc).
- Meeting UI: only inside `<openvidu-meet>`; the iframe and the standalone app are not affected.
- REST API, webhooks, console UI, deployment configuration: none.
- Code: `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/utils/keyboard-shortcut.utils.ts` (`isShortcut`), the `R` listener of `meeting-toolbar-extra-buttons.component.ts`, the `E` listener and the capturing digit listener of `meeting-toolbar-reactions-button.component.ts`, the `F11` listener of `openvidu-components/components/toolbar/toolbar.component.ts`; Option A also `openvidu-components/components/meeting-view/meeting-view.component.html`; Option B also `meet-ce/typings/src/embedded/attributes.ts` and the webcomponent attribute handling.
- openvidu.io: `docs/meet/features/meetings/raise-hand.md` and `docs/meet/features/meetings/reactions.md` (where the keys work when embedded); under Option B also the regenerated attributes reference (`shared/meet/webcomponent/attributes.md`).

## Decisions to confirm

- Open product question: how to scope the single-key meeting shortcuts inside `<openvidu-meet>`. Option A: act only on keys pressed with the focus inside the element, with the meeting focusable so a click inside keeps the focus there. Option B: keep them page-wide and add an attribute that lets the host turn them off.
- Whether `F11` follows the same rule. Proposed: yes, one rule for every meeting key, which also changes behavior shipped before 3.10.0 and therefore takes a `Fixed` line. Alternative: leave `F11` as it is and limit the change to the 3.10.0 keys.

## Source

3.10.0 pre-release audit, finding IM-2 (medium, verified-live), introduced by #109 and #117.
