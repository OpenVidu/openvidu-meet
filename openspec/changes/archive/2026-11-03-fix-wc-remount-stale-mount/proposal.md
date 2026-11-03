# Proposal

## Why

A host that replaces an `<openvidu-meet>` element with a new one on another room can end on an error
dialog, "An error occurred while initializing the meeting lobby", instead of the new room's join screen. The
outgoing element stays alive for a few milliseconds after the new one starts. In that window both keep
navigating the router they share, each triggering the other's navigation, and the room member token of the
old room can end up serving the new room's requests, which the server refuses with 403. It happened in about
one replacement in eight under load.

## What Changes

- The outgoing element no longer navigates once a newer one owns the shared state, so the new element enters
  its own room undisturbed.
- A new requirement states the rule for a replaced element.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-api`: ADDED "A replaced element does not disturb its replacement".

## Impact

- Embedded API: the element only; no contract change. The iframe and the direct link are not affected: each
  starts a page of its own.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the root component of the webcomponent (`meet-ce/frontend/webcomponent/src/app/app.ts`).
- openvidu.io: none.

## Source

Failure of the webcomponent e2e test "should not send the host page to an earlier entry's redirect from a new
webcomponent without one" in pull request 157, reproduced locally in 5 of 40 runs and gone in 70 of 70 with
this change.
