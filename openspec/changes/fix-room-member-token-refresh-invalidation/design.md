# Design

## Context

`POST /internal-api/v1/rooms/{roomId}/members/token/refresh` runs no `withAuth`. `refreshRoomMemberToken` calls
`getValidatedRoomMemberTokenContext` (signature with `REFRESH_CLOCK_TOLERANCE_SECONDS` = 10, metadata, room) and
then `buildTokenMetadataFromParticipant`, which copies the permissions, badge, `memberId` and `userId` from the
participant's LiveKit metadata and stamps a new `iat`.

The LiveKit metadata is written at join, by a regeneration and by a promotion or demotion. `updateRoomMember` and
`updateUserRole` only bump `permissionsUpdatedAt` or `roleUpdatedAt` and send the "permissions updated" signal; the
stock client answers it with a regeneration (`generateRoomMemberToken` with its secret and its current token),
which resolves the permissions again from the database. A client that refreshes instead gets the pre-change
permissions back under a fresh `iat`, which `roomMemberTokenValidator` then accepts everywhere.

The client calls the refresh in two places: the renewal scheduled before expiry and the reaction to its own
promotion or demotion (`handleLocalParticipantRole`). Both go through `updateTokenInMeeting`, which sends the
participant to "Room access revoked" on `401`, `403` or `404`.

## Goals / Non-Goals

**Goals:**

- A token the API refuses cannot be renewed into one it accepts.
- A participant whose client missed a notice is not taken out of the meeting by the stricter refresh.

**Non-Goals:**

- Pushing a member's new permissions to the live LiveKit participant at `updateRoomMember` time (separate finding:
  revocations reach LiveKit only when the client renews).
- Changing what the regeneration path checks on the token it receives as an identity hint.

## Decisions

- **Reuse the room member token checks of `roomMemberTokenValidator`.** Extract its body (signature, metadata,
  `rolesUpdatedAt`, demotion revocation, `permissionsUpdatedAt` and member existence, `roleUpdatedAt` and user
  existence) into one function that takes the clock tolerance, used by the validator with `0` and by the refresh
  with `REFRESH_CLOCK_TOLERANCE_SECONDS`, replacing `getValidatedRoomMemberTokenContext` for the refresh. The room
  check (`403` for another room's token) stays as it is. One definition of a valid room member token instead of a
  second, weaker one.
  Alternative considered: keep the refresh lenient and rebuild the permissions from the database. Rejected: an
  anonymous participant has no database record and the token does not carry the secret it was issued with, so the
  refresh cannot recompute them.
- **Apply the demotion revocation too.** The refresh after a demotion already returns the demoted permissions, so
  exempting it would be safe, but it would make the refresh the one endpoint that accepts a revoked token. With
  the client fallback below, a demotion costs one refused refresh and one regeneration. Listed in the proposal's
  `Decisions to confirm`.
- **Client fallback in the library.** When the refresh answers `401`, the renewal requests a join token with the
  meeting's room secret (or the signed-in user's access token) and the current token as `X-Room-Member-Token`,
  exactly as the "permissions updated" handler does, and only a refusal of that request (or a refresh refused
  with `403`/`404`) reaches the "Room access revoked" path of `updateTokenInMeeting`. It lives in
  `shared-meet-components` (room member context and meeting event handler), so CE and PRO shells and the
  embedded element get it unchanged.
- **Several replicas.** The timestamps live in MongoDB and the demotion key in Redis, both shared, so a change made
  through one replica is enforced by a refresh served by any other; nothing is cached in process memory.

## Risks / Trade-offs

- [A client older than this change, cached in a browser during the upgrade, gets `401` on a refresh after a missed
  notice and shows "Room access revoked"] → the SPA and the webcomponent bundle are served by the same backend, so
  a reload picks up the new client; all replicas run the same version.
- [The fallback needs the entry credentials] → every entry (access link `secret`, identified guest link, signed-in
  user; `room-url` for the embedded element) leaves them in the meeting context, as the "permissions updated"
  handler already relies on.
- [Extra request on every demotion] → one refused refresh per demotion, negligible.

## Migration Plan

None: no persisted field changes. Tokens renewed through the lenient refresh before the upgrade stay valid until
they expire (`MEET_ROOM_MEMBER_TOKEN_EXPIRATION`, default `2h`); the advisory states it.
