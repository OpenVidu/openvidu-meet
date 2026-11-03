# Proposal

## Why

When an anonymous participant or identified guest returns to a meeting after their device slept past the token expiry, the token renewal is refused and the fallback request for a new token is refused too. That second refusal goes through the user session recovery, which fails and sends them to the Meet login page instead of the "Room access revoked" screen.

## What Changes

- The request that obtains a new join token during a meeting carries the header that skips the user session recovery, as the renewal request already does.
- No spec change: the fix makes `room-members` "The meeting keeps its token current" and `meeting-join` "Access lost during the meeting" hold for a refusal of that request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `room-members` "The meeting keeps its token current".

## Impact

- Meeting UI: a participant who loses access ends on "Room access revoked" in every embedding mode.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: `generateToken` of `room-member.service.ts` in the `shared-meet-components` library.
- openvidu.io: none.

## Decisions to confirm

- Which requests get the header. Proposed: every `generateToken` call, since it refreshes the access token first and the interceptor recovery adds nothing. Alternative: only the two in-meeting callers (refused renewal and permissions updated).

## Source

3.10.0 pre-release audit, finding TK-2 (low, static-high), introduced by #142.
