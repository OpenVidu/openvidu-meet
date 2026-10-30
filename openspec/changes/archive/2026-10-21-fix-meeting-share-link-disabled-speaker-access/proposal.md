# Proposal

## Why

The meeting's share points (join screen, toolbar button, participants panel, overlay while alone) copy the
room's anonymous speaker link without checking whether that access is enabled. In a room whose anonymous
speaker access is disabled, a moderator shares a link that every recipient is refused with, while the
console share dialog already hides disabled links.

## What Changes

- The meeting offers the anonymous speaker link only while `access.anonymous.speaker.enabled` is `true`.
  When it is disabled, the join screen shows no share link, the toolbar button and the participants panel
  entry are hidden, and the overlay shown while alone falls back to the waiting notice.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-access`: "Sharing the room from the meeting" offers the link only while it is enabled, with a
  scenario for a disabled link.

## Impact

- Meeting UI: the share points listed above, standalone app only (embedded meetings never show them).
- REST API, webhooks, embedded API, console UI, deployment configuration: none. The meeting already reads
  `access` through `getRoom`.
- Code: `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/room-access-link.service.ts`
  and the toolbar and invite-panel customization components that show the copy action.
- openvidu.io: none (`docs/meet/features/rooms/access.md` does not describe the in-meeting share points).

## Decisions to confirm

- With the anonymous speaker link disabled the meeting offers nothing to share. Alternative: offer the user
  access link instead when `access.user.enabled` is `true`.
