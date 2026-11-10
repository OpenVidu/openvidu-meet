# Proposal

## Why

A pre-existing security defect, found on 2026-11-09 while reviewing the waiting room and independent of it: an identified guest's personal link uses their `memberId` as its `secret`, and that same `memberId` is their participant identity.

- `createRoomMember` gives an identified guest `memberId = guest-<random>` and `accessUrl = /room/{roomId}?secret=<memberId>` (`room-member.service.ts:147-153`).
- A `secret` starting with `guest-` is looked up as a `memberId` (`room-member.service.ts:672-693`, `room-member.middleware.ts:120-136`).
- The member's participant identity is that `memberId` (`room-member.service.ts:509-513`), as the `meetings` spec requires ("the member id for room members").
- Every participant of a meeting can read each participant identity (media server roster, participant list), and webhooks and embedded events carry it.

So anyone let into a meeting can request room member tokens as any identified guest they saw, with that guest's permissions, a guest moderator's included (and, with the waiting room, past the line). The docs promise the opposite: the link is "unique and personal" and "must not be shared" (openvidu.io `docs/meet/features/room-members/overview.md`).

## Compatibility constraint

Both halves of the defect are specified behavior: the `room-members` spec states that a guest's `accessUrl` carries the `memberId` as its `secret`, and the `meetings` spec states that a member's participant identity is the `memberId`. Closing the defect for every existing guest at once breaks one of them: giving existing guests a new secret makes every guest link already sent stop working, and changing the participant identity breaks every integration that correlates webhooks, events or REST calls with the `memberId`.

Meet adds no backward incompatibilities (USER, 2026-11-09). So 3.10.0 fixes every guest it adds and keeps the links of earlier guests working, deprecated, until 3.13.0.

## What Changes

- Every identified guest added from 3.10.0 on gets an `accessUrl` whose `secret` is their `memberId`, a hyphen and random characters, for example `?secret=guest-3f9a1c7b2e-8d41e0c9a7`. The `memberId` alone no longer grants that guest's access.
- A `secret` grants a guest's access only when it is exactly the secret stored in that guest's `accessUrl`. For guests added before 3.10.0 that stored secret is their `memberId`, so their links keep working unchanged.
- Unchanged: a `guest-` secret that matches no guest's link answers `404` and the meeting shows "Invalid member"; any other unknown secret answers `400`. Participant identities, webhooks, embedded events, the console and every endpoint shape stay as they are. No migration runs and no index is added.
- Deprecated: an identified guest link whose `secret` is the guest's `memberId`, the form of every guest added before 3.10.0. It works alongside the new form until 3.13.0, which gives those guests a new secret (a breaking change, through its own OpenSpec change). Until then a room manager closes the exposure for one guest by removing them and adding them again, which also gives the guest a new `memberId` and removes them from the room's ongoing meeting. The server logs a warning each time an old link is used, and a manager finds the guests still on it through `getRoomMembers`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: a new identified guest's link carries their `memberId`, a hyphen and a random part as its secret; a secret authenticates a guest only as the exact secret stored in that guest's link; guests added before 3.10.0 keep their link, deprecated until 3.13.0.

## Impact

- REST API (public): no shape change. The `accessUrl` of a guest added from 3.10.0 carries the new secret. The OpenAPI descriptions and examples of `MeetRoomMember` (`memberId`, `accessUrl`) state that the link is the `accessUrl` and that the `memberId` alone does not grant access. An integrator that builds a new guest's link from the `memberId` instead of reading `accessUrl` gets `404` for that guest, and one that reads a new guest's `memberId` from the link's `secret` gets a value that is not the `memberId`. Only the `room-members` spec stated that the two are equal; the published OpenAPI and docs only showed it in examples, and the tutorials always read `accessUrl`.
- A guest's own room member token still reads the guest's `accessUrl` through `getRoomMember`, so a leaked token gives the link (design D4).
- Internal API: `generateRoomMemberToken` documents the `secret` as a room access secret or the secret of an identified guest's `accessUrl`.
- Typings: TSDoc of `MeetRoomMember.memberId`, `MeetRoomMember.accessUrl` and `MeetRoomMemberTokenOptions.secret`; no type changes.
- Webhooks, embedded API, meeting UI and console UI: no change.
- Deployment: a warning in the server log each time a guest link of the old form is used. No migration, no index, no configuration.
- CE extension seams: none needed.
- openvidu.io (`next`): the identified-guests tutorial and the member management page show the new link form and say the personal link is the `accessUrl`; the regenerated REST API reference.
- `CHANGELOG.md` (3.10.0): a `Deprecated` section in the form 3.9.0 used, and a `Fixed` line.
- Release: 3.10.0. Independent of every other change.

## Decisions taken

USER, 2026-11-09:
- This is a pre-existing defect, independent of the waiting room. `add-waiting-room` does not depend on it.
- No backward incompatibilities.

USER, 2026-11-10:
- Option A: fix it in 3.10.0 for every guest added from then on, and keep the old links working, deprecated.
- The old link form works alongside the new one until 3.13.0.
- The new secret separates the `memberId` and the random part with a hyphen (`-`), not a dot.
- Every guest link generated by 3.10.0 uses the new form.
- `CHANGELOG.md` records the deprecation as 3.9.0 recorded its deprecations.
- A guest's own room member token keeps reading the guest's `accessUrl`; that a leaked token gives the link is accepted and documented in the design (D4).
- An integrator that builds a new guest's link from the `memberId`, or reads the `memberId` from the link, is a documented risk with no `Breaking changes` line: no published page stated that the two are equal.

## Open questions

1. **Regenerating a guest's link.** No regenerate action in this change: the room's anonymous links have none, and removing and adding the guest again gives a new link (and a new `memberId`). Recommended: propose it on its own if needed.
2. **Secret strength.** The random part reuses the room links' generator (10 hexadecimal characters, 40 bits) behind the token issuance rate limit (per client IP and per replica, design Risks). The format is new, so a longer random part costs nothing now and would be another format change later; in a room with its anonymous links disabled, the guests' links are its only secrets. Recommended: keep parity with the room links here.
