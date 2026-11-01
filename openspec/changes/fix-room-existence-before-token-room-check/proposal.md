# Proposal

## Why

A room member token of one room can find out whether any other room exists: on `getRoomMember` and on the moderation operations the server answers `404` for a room that does not exist and `403` for one that does. The 3.10.0 changelog already closes this leak for `startRecording`, and `meeting-moderation` says a token for another room gets `403`.

## What Changes

- A room member token issued for another room gets `403` before the server looks the room up, whether or not that room exists; `404` for a missing room stays for API key and user callers.
- `getRoomMember` and the moderation operations follow the same rule as `startRecording`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: "Reading one member" gives `403` to another room's token before any `404` for the room.
- `meeting-moderation`: "Who may moderate" gives `403` to another room's token whether or not the room exists.

## Impact

- REST API: `getRoomMember` and the operations guarded by a room permission (`participantKick`, `participantMute`, `participantMuteAll`, `participantPromote` and the rest); a token of another room gets `403` where it got `404`; the OpenAPI already lists `403`, so the contract does not change.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: `withRoomPermission` in `room.middleware.ts` and `room-member.middleware.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- Which rule to keep, since two specs took opposite sides. Proposed: `403` for another room's token before any lookup (the cheaper one, and the one `startRecording` already follows). Alternative: `404` for a missing room first, as `room-members` said.
- Delivery: private advisory or regular public pull request.

## Source

3.10.0 pre-release audit, findings TK-7 and RM-8 (low, verified-live), pre-existing and kept by #131, #132 and #144.
