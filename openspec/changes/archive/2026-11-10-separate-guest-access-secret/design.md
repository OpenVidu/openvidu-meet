# Design

## Context

See proposal.md for why and for the compatibility constraint. The current code on `main`:

- `createRoomMember` gives an identified guest `memberId = guest-${secureUid(10)}` and `accessUrl = /room/{roomId}?secret=${memberId}` (`meet-ce/backend/src/services/room-member.service.ts:147-153`).
- A secret starting with `guest-` is looked up as a `memberId`, twice: in `authorizeRoomMemberTokenGeneration` (`meet-ce/backend/src/middlewares/room-member.middleware.ts:120-136`, `404` when missing) and in `resolvePermissionSourceFromSecret` (`room-member.service.ts:672-693`), which checks the `guest-` prefix first. Any other secret is compared with the room's anonymous secrets (`room-member.middleware.ts:138-146`, `room-member.service.ts:706-720`, `400` when none matches).
- `RoomService.isValidRoomSecret` (`meet-ce/backend/src/services/room.service.ts:983`) has one caller, that middleware branch.
- `errorRoomMemberNotFound(roomId, memberId)` puts the id it is given in the response message, and `handleError` logs that message at debug level. Today the resolver passes it the whole secret.
- The member then becomes the token's `memberId` (`room-member.service.ts:408`) and the participant identity (`room-member.service.ts:509-513`), which every participant can read.
- The room's anonymous links keep their secret only inside the stored URL, `/room/{roomId}?secret=${secureUid(10)}` (`meet-ce/backend/src/services/room.service.ts:161-175`), and `MeetRoomHelper.extractSecretsFromRoom` reads it back from there.
- A member's `accessUrl` is stored as a path without base URL and enriched on read (`meet-ce/backend/src/repositories/room-member.repository.ts:304-322`).
- `secureUid` (`uid/secure`) yields hexadecimal characters from a CSPRNG, never a hyphen; 10 characters are 40 bits. `{ roomId, memberId }` is a unique index (`meet-ce/backend/src/models/mongoose-schemas/room-member.schema.ts:110`). Every stored guest has a `memberId` of the form `guest-<10 hexadecimal characters>`: room members first shipped in 3.8.0, already with that prefix. A `userId` admits no hyphen (`^[a-z0-9_]+$`).
- `getRoomMember` is public (`/api/v1`) and accepts the member's own room member token (`room-member.middleware.ts:58-63`). The meeting client reads its own member that way on every token it decodes, and never uses `accessUrl`. A room member token lasts 2 h by default and also travels as the `roomMemberToken` query parameter of recording media URLs.
- 3.10.0 migrates the stored rooms and room members, and a 3.9 server does not start on the migrated database (`CHANGELOG.md`, 3.10.0 upgrade notes), so there is no rollback to 3.9 to design for.

## Goals / Non-Goals

**Goals:**
- A guest added from 3.10.0 on has a link secret that no other participant can derive from what they see.
- Nothing that works today stops working: links already sent, status codes, screens, identities, endpoint shapes.
- One rule for guest secrets: the exact secret stored in the guest's `accessUrl`, whatever its age.

**Non-Goals:**
- Replacing the links of guests added before 3.10.0 (3.13.0, its own change).
- Changing participant identities, the participant list, webhooks or embedded events.
- A "regenerate link" action or a different secret length (proposal, open questions).
- Hiding `accessUrl` from the guest's own `getRoomMember` (D4).

## Decisions

### D1. The new secret is the `memberId`, a hyphen and a random part

A new identified guest gets `accessUrl = /room/{roomId}?secret=${memberId}-${secureUid(10)}`, for example `?secret=guest-3f9a1c7b2e-8d41e0c9a7`. The `memberId` inside the link is already public as the identity; the random part is the secret. The `guest-` prefix keeps today's error mapping (D2), so an unknown guest link still answers `404` and shows "Invalid member". No new field: the stored URL is the one place the secret lives, as for the room's links.

Alternatives:
- A random secret unrelated to the `memberId`: the resolver would need a new finder over the stored `accessUrl` and a new index. Rejected for the extra lookup and index.
- A dot as separator: rejected (USER, 2026-11-10).

### D2. One resolver, dispatched by prefix as today

`resolvePermissionSourceFromSecret` keeps today's dispatch. A secret that does not start with `guest-` goes to `resolveAnonymousAccessBySecret`, unchanged (`400` when no room secret matches, `403` when the matching link is disabled). Only the `guest-` branch changes:

- its `memberId` is the secret up to its second hyphen (the whole secret for the old form);
- the resolver finds that member through `{ roomId, memberId }` and accepts the secret only when it equals the `secret` query parameter of the member's stored `accessUrl`, read from the stored path with a base URL (`new URL(path)` alone throws on a path);
- a missing member and a different secret throw the same `errorRoomMemberNotFound(roomId, memberId)`, named by that `memberId` and never by the secret, so the response and the debug log neither repeat the secret nor tell the two cases apart.

This one rule covers both ages of guest:
- a guest added before 3.10.0 has `?secret=<memberId>` stored, so their link resolves unchanged;
- a guest added from 3.10.0 has `?secret=<memberId>-<random>` stored, so their bare `memberId`, or the `memberId` with any other random part, answers `404`.

No flag and no migration distinguish them. A user member's `accessUrl` carries no secret, so no secret authenticates as a user member.

The secret branch of `authorizeRoomMemberTokenGeneration` (`room-member.middleware.ts:120-149`) stops validating the secret: `generateRoomMemberToken` resolves it (`room-member.service.ts:388-392`) and raises the same errors, so the check runs once. The room's existence is still checked first (`room-member.middleware.ts:106-113`). `RoomService.isValidRoomSecret` loses its only caller and is deleted.

Alternatives:
- Comparing the room's anonymous secrets first and the guest afterwards: a `guest-` secret never equals a room secret (hexadecimal), so the order changes no outcome; it adds a room read to every guest token request and needs `resolveAnonymousAccessBySecret` to stop throwing on a mismatch. Rejected.

### D3. No migration; deprecation of the old form until 3.13.0

Stored guests keep their `accessUrl`, so no schema version changes. The old form (`secret` equal to `memberId`) is deprecated in `CHANGELOG.md` and works until 3.13.0. Its removal in 3.13.0 is a separate OpenSpec change: a member migration giving each remaining guest a new secret, with its breaking-change line.

Each time a secret of the old form authenticates, the server logs a warning naming the room and the member as deprecated, so an operator sees which old links are still in use before 3.13.0. A manager finds the guests still on the old form through `getRoomMembers`: their `accessUrl` carries their `memberId` as its `secret`.

### D4. Exposure of the secret

`accessUrl` keeps reaching exactly the callers it reaches today: managers through the room member endpoints (`meet-ce/backend/src/routes/room.routes.ts:141-191`) and a guest reading their own record (`room-member.middleware.ts:58-63`). No participant reads another member's record.

The guest's own room member token therefore reads the guest's link. Whoever obtains that token, for instance from a recording media URL that carries it as `roomMemberToken`, can read the link while the token lasts and use it while the member exists. Accepted and kept (USER, 2026-11-10): it is not a regression, because today the token's own `memberId` already is the secret, and leaving `accessUrl` out of that response would change a public endpoint. Removing the guest revokes the link.

### D5. Contracts

- OpenAPI (public): `meet-ce/backend/openapi/room-members/schemas/meet-room-member.yaml` (`memberId`; `accessUrl` is the guest's link, and the `memberId` alone does not grant access); the examples in `responses/success/add-room-member.yaml` and `responses/success/get-room-members.yaml` show the new form, so no example carries the same value as `memberId` and as `secret`.
- OpenAPI (internal): `room-members/internal/room-members.yaml` and `room-members/internal/schemas/room-member-token-options.yaml` describe the `secret` as a room access secret or the secret of an identified guest's `accessUrl`.
- Typings TSDoc: `MeetRoomMember.memberId` and `MeetRoomMember.accessUrl` (`meet-ce/typings/src/database/room-member.entity.ts:8-19`), `MeetRoomMemberTokenOptions.secret` (`meet-ce/typings/src/request/room-member-request.ts:23-26`). No type changes.

### Several replicas

The resolver reads MongoDB on every request and keeps no state in process memory, so any replica resolves any guest secret.

## Risks / Trade-offs

- [Guests added before 3.10.0 stay impersonable by anyone who saw their identity] → Deprecated and closed in 3.13.0. Until then a manager closes it for one guest by removing and re-adding them, which gives a new link and a new `memberId`, removes the guest from the room's ongoing meeting, and needs the new link sent to the guest. The deprecation warning (D3) and `getRoomMembers` show which guests are affected. Stated in the CHANGELOG deprecation and on the member management page.
- [An integrator that builds a new guest's link from `memberId`, or reads a new guest's `memberId` from the link's `secret`, fails for that guest] → Only the `room-members` spec, which this change corrects, stated that the two are equal; the published OpenAPI and docs only showed it in examples, and the tutorials always read `accessUrl`. Accepted as a risk, with no `Breaking changes` line (USER, 2026-11-10). The OpenAPI and the docs now state that the link is the `accessUrl` and that the `memberId` alone does not grant access.
- [A leaked room member token of a guest gives that guest's link] → Accepted (D4).
- [40-bit random part] → Parity with the room's links behind `tokenIssuanceLimiter` (`room.routes.ts:201`): 200 requests a minute per client IP, counted in each replica's memory, the IP being the left-most `X-Forwarded-For` entry under the default `SERVER_TRUST_PROXY=true`, so the limit is as strong as the proxy in front of Meet. In a room with its anonymous links disabled, the guests' links are its only secrets. Proposal open question 2.

## Migration Plan

Deploy. Stored members are untouched; guests added from then on get the new form.

## Open Questions

See proposal.md, "Open questions".
