# Design

## Context

Two paths already apply permissions to a live participant: the join-token regeneration in
`generateTokenForJoiningMeeting` (refresh mode) and `updateParticipantRole` (promotion and demotion). Both run
under `withParticipantMetadataLock`, a per-participant `MutexService` lock in Redis, read the participant from
LiveKit, keep a promotion (`isPromotedModerator`, `originalPermissions`), and call
`livekitService.updateParticipant` with the new metadata and the grant from `buildLiveParticipantPermission`.
`updateRoomMember` only calls `notifyParticipantPermissionsUpdate`. A member's participant identity is its
`memberId`.

## Goals / Non-Goals

**Goals:**
- The grant and the metadata of a member in the meeting follow `updateRoomMember` without the client.
- One method applies new base permissions to a live participant, used by `updateRoomMember` and by the
  regeneration path.

**Non-Goals:**
- Room role updates: `updateRoomRoles` answers `409` during a meeting.
- User role changes (`user.service.ts`), which reach participants through the same signal; they belong to the
  authentication area.

## Decisions

### Extract the live-apply block

The regeneration's block that merges a promoted participant's new base permissions with the moderator role,
writes `originalPermissions`, `permissions`, `badge` and `isPromotedModerator` into the metadata and pushes
the grant becomes `applyPermissionsToLiveParticipant(roomId, identity, permissions)`. `updateRoomMember` calls
it after storing the member, when the member is in the meeting and keeps `meetingJoin`, then sends the
renewal signal as today. The regeneration path calls the same method, so the two cannot drift.

Alternative: keep the client-driven renewal and only shorten its timeout. It still trusts the client.

### Several replicas

The method runs under `withParticipantMetadataLock`, so a promotion on one replica and a member update on
another serialize through Redis, and each reads the metadata the other wrote. A participant who leaves
between the presence check and the update makes LiveKit answer not found, which is treated as nothing to
apply (the member is no longer in the meeting).

## Risks / Trade-offs

- [The lock wait adds latency to `updateRoomMember` while a role change of the same participant runs] →
  Bounded by the existing lock timeout; on timeout the update stays stored and the renewal signal still
  carries it, as today.
- [A member update and the participant's own renewal both apply the grant] → Idempotent: both write the
  same permissions.
