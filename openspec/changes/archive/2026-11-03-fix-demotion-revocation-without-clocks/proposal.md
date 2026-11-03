# Proposal

## Why

After a demotion from moderator, every room member token issued for that participant in the next 10 seconds carries an issue time 10 seconds in the future. Those tokens then outlive any other change made in that window: if an administrator restricts the member's permissions or changes the user's role a few seconds after the demotion, the token issued in between keeps the earlier access for its whole lifetime (two hours by default), on the REST API and, through the join check, at the media server. The meeting also reads its elapsed time from that issue time, so its timers jump by up to 10 seconds.

## What Changes

- A room member token records the demotion revocation that was in place when it was issued. A demotion revokes every token that does not carry it, whatever the clocks of the replicas that issued the token and recorded the revocation.
- Tokens are issued with the time of the replica that issues them again, never ahead of it.
- No spec change: `authentication` "Demotion revokes room member tokens" already requires every earlier token to be rejected on every replica, and the checks against later room, member and user changes rely on an issue time that is not in the future.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- REST API, webhooks, embedded API: no contract changes. The room member token metadata gains an optional field (`issuedAfterRevocation`) the server reads back; clients ignore it.
- Meeting UI: the elapsed time and the duration countdown no longer shift after a demotion.
- Deployment configuration: none. Redis keeps the same key and value.
- Code: `participant-token-revocation.service.ts`, the token issue points of `room-member.service.ts`, `checkRoomMemberTokenCurrency` in `auth.middleware.ts`, the room member token metadata schema and its typing.
- openvidu.io: none.

## Source

Review of PR #162 (`fix-role-demotion-revocation-timing`), 2026-11-03.
