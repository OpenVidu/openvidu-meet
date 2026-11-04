# Proposal

## Why

In the Live broadcast step of the room wizard, a destination being edited is remembered by its position
in the list, while Edit and Remove stay available on the other rows. Removing a row above it makes the
editor save onto the next destination: that destination gets the new name while keeping its own stream
key, and the one meant to change stays as it was. Removing a row while the last one is being edited
makes the editor vanish and hides Add until the step is left.

## What Changes

- The wizard edits the destination the editor was opened on, whatever rows are removed meanwhile.
  Removing the destination being edited closes the editor; removing any other leaves the editor open on
  its destination.
- Requirement "Live broadcast in the room wizard" of `live-broadcast` gets a scenario for a row removed
  while another is edited.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-broadcast`: requirement "Live broadcast in the room wizard" (MODIFIED).

## Impact

- Console UI: the Live broadcast step of the room wizard, in create and edit mode.
- REST API, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code: `BroadcastConfigComponent` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/rooms/pages/room-wizard/steps/broadcast-config/`).
- openvidu.io: none.

## Decisions

- How the editor keeps hold of the destination it edits. Decided: by the destination object itself,
  since a destination added in the wizard has no `id` yet, so Edit and Remove stay available on the other
  rows. Alternative: hide Edit and Remove on every row while the editor is open, as Add already is, which
  keeps the index but blocks those actions during an edit.

## Source

3.10.0 pre-release audit, finding BF-2 (medium, verified-live), introduced by #120.
