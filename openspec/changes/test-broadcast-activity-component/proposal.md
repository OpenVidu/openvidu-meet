# Proposal

## Why

The component behind the Live broadcast activity, where most broadcast UI bugs have been found, has no
unit test. Its row and phase logic is only exercised by end-to-end tests of the happy path.

## What Changes

- One Karma spec for `BroadcastActivityComponent` over its `rows()` and `phase()` logic with a stub
  broadcast state: a refusal while live, the refusal of an added destination while another row is failed,
  and a destination added for the meeting after the component is created anew.
- Tests only: no behavior changes and no spec delta. The cases for `fix-broadcast-destination-failures-kept`
  and `fix-broadcast-panel-keeps-choices` are added in this file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Tests do not change behavior.

## Impact

- Code: a new `broadcast-activity.component.spec.ts` beside the component in
  `meet-ce/frontend/projects/shared-meet-components`; no production code.
- REST API, webhooks, embedded API, UIs, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Whether the activity logic is tested through the component or extracted first. Proposed: through the
  component with a stub state service, no refactor. Alternative: extract `rows()` and `phase()` into a
  pure helper and test that.

## Source

3.10.0 pre-release audit, finding BF-12 (low, static-high), introduced by #120.
