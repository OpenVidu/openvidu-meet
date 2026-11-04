# Proposal

## Why

Inside `<openvidu-meet>`, the meeting reads its single-key shortcuts from the whole host page: `R` raises or lowers the hand, `E` opens the reaction picker, and while it is open `1` to `8` send a reaction, wherever the focus is outside a text field. A host application with its own single-key shortcuts (a helpdesk where `R` replies, a whiteboard where `R` draws a rectangle and digits pick tools) raises the participant's hand in front of everyone and sends reactions every time its user presses them. The iframe and the standalone app are not affected: the meeting has its own document there.

## What Changes

- Inside `<openvidu-meet>`, `R`, `E`, `1` to `8` and the `F11` fullscreen key act only when the key is pressed with the focus inside the element. A click anywhere in the meeting, not only on a button, puts the focus inside it, so the shortcuts work after clicking the video grid. The iframe and the standalone app keep today's behavior.
- `F11`, which the meeting has read from the whole host page since earlier releases, follows the same rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `raise-hand`: "Raise hand from the toolbar and the keyboard".
- `reactions`: "Reaction keyboard shortcuts".
- `meeting-layout`: "Fullscreen" (`F11`).

## Impact

- Embedded API: no contract change.
- Meeting UI: only inside `<openvidu-meet>`; the iframe and the standalone app are not affected.
- REST API, webhooks, console UI, deployment configuration: none.
- Code: `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/utils/keyboard-shortcut.utils.ts` (`isShortcut`, `isMeetingKey`), the `R` listener of `meeting-toolbar-extra-buttons.component.ts`, the `E` listener and the capturing digit listener of `meeting-toolbar-reactions-button.component.ts`, the `F11` listener of `openvidu-components/components/toolbar/toolbar.component.ts` and `openvidu-components/components/meeting-view/meeting-view.component.html`.
- openvidu.io: `docs/meet/features/meetings/raise-hand.md` and `docs/meet/features/meetings/reactions.md` (where the keys work when embedded).

## Decisions to confirm

- How to scope the single-key meeting shortcuts inside `<openvidu-meet>`. Decided: Option A, act only on keys pressed with the focus inside the element, with the meeting focusable so a click inside keeps the focus there. Alternative (Option B, not taken): keep them page-wide and add an attribute that lets the host turn them off.
- Whether `F11` follows the same rule. Decided: yes, one rule for every meeting key, which also changes behavior shipped before 3.10.0 and therefore takes a `Fixed` line.

## Source

3.10.0 pre-release audit, finding IM-2 (medium, verified-live), introduced by #109 and #117.
