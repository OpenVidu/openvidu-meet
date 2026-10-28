# Proposal

## Why

A participant's display name is reserved when their join token is generated and freed when the media server reports that they left. A room member or registered user who joins again before their earlier session's departure has been processed (leaving and rejoining quickly, reloading the page, or opening the meeting in a second tab, which replaces the first session) finds their own name still reserved and is renamed `Name_1`. When the earlier session's departure is processed afterwards it frees `Name`, so the participant keeps the suffix for the rest of the meeting while the plain name is free for anyone else.

## What Changes

- A name reservation remembers which participant identity holds it. A join token for the same identity reuses that identity's reservation instead of taking a suffix.
- The departure of a session frees its name only when the reservation still belongs to that session, that is, it was not taken over by a later session of the same identity. The new session's name stays reserved.
- Anonymous participants are not affected: each of their joins has a new identity, so Meet cannot tell a quick rejoin from a second person with the same name.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meetings`: the requirement "Joining again replaces the earlier session" states that the new session keeps the name it asks for when only the session it replaces holds it.

## Impact

- Meeting UI, REST API (`participantList`, `participantGet`), webhooks (`participantJoined`, `participantLeft` and the others carrying the participant) and embedded events: a returning room member or user keeps their name instead of `Name_1`. No contract change.
- Console UI, deployment configuration: not affected.
- Backend: participant name reservation (Redis) and its release on the media server's departure notice.
- openvidu.io: no page changes.

## Decisions to confirm

- Only identified participants (room members and registered users) keep their name on a quick rejoin; an anonymous participant who rejoins before the departure is processed still gets a suffix (alternative: let the meeting UI reuse the anonymous identity of the same browser tab when rejoining, which changes the specified "new identity per join" of anonymous participants).
