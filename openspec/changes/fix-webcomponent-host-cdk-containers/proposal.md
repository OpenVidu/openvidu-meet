# Proposal

## Why

A host page that uses Angular CDK or Material itself has its screen-reader live region and its tooltip
description container pulled into Meet's shadow root. Its `aria-describedby` references stop resolving, and
once the element is removed the host announces nothing for the rest of the page's life.

## What Changes

- The element moves into its shadow root only the nodes that Meet itself created, and never a node of the
  host page.
- Meet's live announcer is created inside the shadow root, so it no longer removes the host's live region.
- A new requirement states that the element leaves the host page's own nodes in place.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-distribution`: ADDED "The host page's own nodes stay in the host page".

## Impact

- Embedded API: webcomponent only; no contract change.
- Meeting UI: none visible; accessibility of the host page is preserved.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the shadow-dom body nodes service and the app config of `meet-ce/frontend/webcomponent`.
- openvidu.io: none.

## Decisions to confirm

- How to tell Meet's description container from the host's. Proposed: a distinct application id in the
  element, matched in the container's message ids. Alternative: create Meet's container inside the shadow
  root and stop observing `document.body`.

## Source

3.10.0 pre-release audit, finding EM-4 (medium, verified-live), introduced by #135.
