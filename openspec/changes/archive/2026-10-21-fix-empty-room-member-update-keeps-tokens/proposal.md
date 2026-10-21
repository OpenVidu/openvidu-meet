# Proposal

## Why

`updateRoomMember` advances the member's `permissionsUpdatedAt` and signals a member in the meeting to renew
its token on every call, even when nothing changes (an empty body, or overrides equal to the base role).
Advancing that timestamp revokes every room member token the member holds, so a no-op call from an
integration logs a member's open recordings page out and shows a member in the meeting a "permissions
updated" notice for nothing.

## What Changes

- `updateRoomMember` compares the recomputed `effectivePermissions` with the stored ones. Only when they
  differ does it advance `permissionsUpdatedAt`, revoke the member's earlier tokens and ask a member in the
  meeting to renew its token.
- A change of `baseRole` or `customPermissions` that leaves the effective permissions as they were is still
  stored and returned, without those effects.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: "Effective permissions" (when `permissionsUpdatedAt` advances), "Updating a member"
  (earlier tokens are revoked only when the effective permissions change) and "Permission changes reach a
  member in the meeting" (the renewal request only follows a change).

## Impact

- REST API: `updateRoomMember` (public). Same request and response; `permissionsUpdatedAt` no longer moves
  on an update without effect, and tokens are no longer revoked by one. No contract change; the OpenAPI
  description of `updateRoomMember` is reworded.
- Meeting UI: no "permissions updated" notice after an update without effect.
- Webhooks, embedded API, console UI, deployment configuration: none.
- Code: `meet-ce/backend/src/services/room-member.service.ts` (`updateRoomMember`).
- openvidu.io: none.

## Decisions to confirm

- The comparison is on the effective permissions, so a `baseRole` change that grants exactly the same
  permissions keeps the member's tokens valid. Alternative: revoke whenever `baseRole` or `customPermissions`
  change, even without effect.
