# Proposal

## Why

When `updateRoomMember` changes the permissions of a member who is in the meeting, the server only signals
the participant's client to renew its token; the new media grant reaches LiveKit when that client
regenerates its token. A client that ignores the signal keeps publishing the camera, microphone, screen or
chat it just lost. The 3.9.0 changelog states that revoking `chatWrite` or a media permission mid-meeting
reaches the media server, and promotions and demotions already push the grant from the server.

## What Changes

- `updateRoomMember`, for a member in the meeting, applies the new permissions to the live participant from
  the server, as a promotion does: the LiveKit grant (which removes tracks of sources no longer allowed) and
  the participant metadata, keeping a promotion to moderator in place. The signal to renew the token stays,
  so the meeting interface follows.
- Because the metadata is updated too, a later `refreshRoomMemberToken` or reconnection keeps the new grant.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `permissions`: "The media grant follows permission changes" applies the grant when the permissions change,
  not when the client renews its token, with scenarios for an ignoring client and two replicas.

## Impact

- REST API: `updateRoomMember` (public), same contract; its OpenAPI description says the new permissions are
  applied to a member already in the meeting.
- Meeting UI: none for unmodified clients.
- Webhooks, embedded API, console UI, deployment configuration: none.
- Code: `meet-ce/backend/src/services/room-member.service.ts` (`updateRoomMember` and the live-apply block
  of the token regeneration path, which become one method).
- openvidu.io: none.
