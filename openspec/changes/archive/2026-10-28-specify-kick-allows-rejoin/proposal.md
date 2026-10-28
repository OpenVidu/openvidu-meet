# Proposal

## Why

The specs say what a kick does to the meeting but not whether the kicked participant may come back. Today a kick only disconnects: the participant keeps the access link, the room member token and the room's permissions, and can enter the meeting again at once. Hosts and moderators need to know whether a kick is a "leave now" or a ban, and the behavior should be stated before anyone relies on either reading.

## What Changes

- The `meeting-moderation` spec states that a kick disconnects the participant from the current meeting only and does not revoke their access to the room: with the same access they may join this meeting again or a later one. Keeping someone out is done by revoking their access (removing the room member, changing the room's access or its links, closing the room).
- No code change is proposed: this is the current behavior, recorded so that it is tested and documented.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-moderation`: new requirement "A kick does not revoke access".

## Impact

- REST API (`participantKick`), embedded command `participantKick`, meeting UI (Remove in the participants panel): behavior unchanged, now specified. No contract change.
- Webhooks, console UI, deployment configuration: not affected.
- openvidu.io: `docs/meet/features/meetings/moderation.md` ("Removing participants") says that a removed participant may join again and how to keep them out.

## Decisions to confirm

- A kick does not prevent re-entry (alternative: a kick bans the participant's identity from the room until the meeting ends, which needs a per-meeting ban list checked at token generation and only works for identified participants, since an anonymous participant gets a new identity on every join).
