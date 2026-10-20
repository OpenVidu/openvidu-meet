# Proposal

## Why

The join screen decides its back button with the webcomponent test (`isWebcomponentMode`) while the end screen uses the embedded test (`isEmbeddedMode`), so the iframe is treated as the standalone app on the join screen only:

- A signed-in user in an iframe without `leave-redirect-url` gets a "Back to Rooms" button. Pressing it emits `embeddedCloseRequested` and nothing else: the iframe never navigates to the console, so the label promises something that does not happen.
- An anonymous participant in the same iframe gets no button at all, although the end screen of the same iframe always has one and the host page can act on `embeddedCloseRequested`.

This was left open in the baseline findings (section 4, "iframe join-screen back button for a signed-in user").

## What Changes

- In an iframe the join screen always offers a back button labelled "Back", whoever the participant is, as the embedded element and the iframe's end screen do.
- Pressing it emits `embeddedCloseRequested` and then follows the leave redirect when one is set, as today.
- The iframe's access error screens get the same rule: a dismiss button that emits `embeddedCloseRequested`, with or without a leave redirect. They lacked one because the host page could not receive the event that early; `fix-iframe-bridge-starts-with-app`, in the same branch and applied first, makes the iframe listen and post from the start, so the exception goes. One rule now covers the join, end and error screens of the iframe.
- The standalone app keeps its current rule ("Back to Rooms" for a signed-in user without a leave redirect, no button for an anonymous one).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-join`: "Back button on the join screen" and "Dismissing the end and error screens" treat the iframe like the embedded element.

## Impact

- Meeting UI: the iframe join screen's back button (presence and label) and the dismiss button of the iframe's access error screens.
- Embedded API: `embeddedCloseRequested` can now be emitted from the join and access error screens of every iframe; no contract change.
- REST API, webhooks, console UI, deployment configuration: not affected.
- Code: the back button rules of the meeting lobby and of the error screen in the `shared-meet-components` library, aligned with the end screen's. Applied after `fix-iframe-bridge-starts-with-app`.
- openvidu.io: none. `docs/meet/features/meetings/lifecycle.md` does not describe the join screen's back button per mode.

## Decisions to confirm

- The iframe join screen always shows "Back" (proposed), like the end screen. Alternative: show it in the iframe only when `leave-redirect-url` is set, hiding the dead "Back to Rooms" button for signed-in users.
- The iframe's access error screens keep showing no dismiss button without a leave redirect, as `meeting-join` specifies today (proposed, unchanged here). Alternative: once `fix-iframe-bridge-starts-with-app` lets the host page receive `embeddedCloseRequested` from those screens, show it there too, for one rule across the iframe's screens.
