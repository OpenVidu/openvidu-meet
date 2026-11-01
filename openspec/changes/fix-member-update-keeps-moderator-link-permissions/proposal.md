# Proposal

## Why

A signed-in member who joined through an anonymous moderator link holds the moderator permissions the link gives. Any update of that member's permissions during the meeting, even an unrelated one, drops those permissions at once: the badge flips to member and the moderator controls vanish until the client renews its token, and a media source the link allowed is cut. A client whose renewal fails stays demoted.

## What Changes

- The permissions the server applies to a live participant after a member update keep what the anonymous role used to join adds, as the renewed token does.
- The role merged at join is recorded in the participant's live metadata so the update can merge it again.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: new requirement "A member update keeps what the link gave them", next to "Secret and user combined".

## Impact

- Meeting UI: no flicker of the badge or the moderator controls on a member update.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: the join metadata and `applyMemberPermissionsToMeeting` of `room-member.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- Where the merged role lives. Proposed: in the participant's live metadata, written at join (nothing persisted). Alternative: derive it again from the token the client holds, which a client that ignores renewals cannot supply.

## Source

3.10.0 pre-release audit, finding RM-4 (low, verified-live), introduced by #131.
