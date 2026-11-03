## Context

The media server fixes a session's grant and metadata from the join token at connection. Meet pushes later changes with `UpdateParticipant`, but reconnecting with an earlier token starts a new session from that token. `refreshRoomMemberToken` then rebuilds a Meet token from the live metadata and accepts the previous token with `ignoreDemotion` (decision 3 of `MEET-OPENSPEC-FIX-DECISIONS.md`: an old client cached during an upgrade must be able to refresh after a demotion), so restored metadata becomes a valid token.

What LiveKit lets Meet control (read in `openvidu-livekit`): the token's `exp` and grants are checked once, at connection; there is no pre-join callback, so the earliest Meet hears of a session is the `participant_joined` webhook; when the grant of a session changes, the server sends the client a refreshed token carrying the current grant and metadata (`refreshToken` in `roommanager.go`), which the SDK keeps for its own reconnections (verify in the SDK version Meet uses, task 1.1). Meet already has a notion of token currency: the token metadata's `iat` against `rolesUpdatedAt`, `permissionsUpdatedAt`, `roleUpdatedAt` and the per-identity demotion revocation.

## Options

| Option | Closes the hole | Cost and limits |
| --- | --- | --- |
| Shorter join token lifetime | Narrows the window only | The same token authenticates the REST API and `MEET_ROOM_MEMBER_TOKEN_EXPIRATION` also sizes the demotion revocation key; any lifetime leaves a window; every deployment sees renewals more often |
| Check the joining session against the currency rules and remove it when stale | Yes, within the delay of the webhook | No new stored state; needs the push to stamp live metadata so honest reconnections pass; the unauthorized session exists until the webhook is processed |
| Rebuild refreshed tokens from server state, never from live metadata | Only the renewal | Members and users can be rebuilt from MongoDB, anonymous participants and promotions live only in the participant metadata and would need new storage; the media grant of the reconnected session is still the old one |

## Decision

Check at join, stamp pushes, and make the renewal check live metadata:

1. `handleParticipantJoined` runs the currency checks of `verifyRoomMemberToken` on the joining session's metadata and removes the session when they fail. The checks become one function used by both. A session the payload shows as stale is read again from the media server first: a push that landed between the join and the webhook made it current, and a session already replaced (another `sid`) is left alone. A database or Redis failure keeps the session, since removing every reconnection during an outage is worse than the window it leaves; the renewal check below still refuses to mint a token from it. A removed session's `sid` is marked in Redis, so its `participant_left` sends no `participantLeft`.
2. Every push of participant metadata sets `iat` to the push time, so the token the media server hands to the client after a push is current: `applyPermissionsToLiveParticipant` (member update and token regeneration) and `updateParticipantRole`. A demotion revokes the earlier tokens before it pushes, so its stamp is never older than the revocation.
3. `refreshRoomMemberToken` runs the same checks on the live metadata. No `ignoreDemotion` is needed for it: after a demotion the pushed metadata is stamped after the revocation. The exemption of decision 3 for the previous token stays.
4. The token regeneration (`generateRoomMemberToken` with a previous token) also reads the live metadata: it keeps a participant promoted when the live metadata says so. It keeps the promotion only when that metadata is newer than the participant's last demotion, so a session that reconnected with a promotion token cannot regenerate one.

The window between connection and removal only grants what the old token granted for the webhook's latency; step 3 keeps that window from yielding a new Meet token.

## Several replicas

Every check reads MongoDB and Redis, so any replica that receives the webhook decides the same. Stamps come from the replica applying the push; the clock margin that `fix-role-demotion-revocation-timing` adds to revocations covers the replica skew.

## Migration

None: no persisted field changes. `iat` already exists in the token metadata that becomes the participant metadata.
