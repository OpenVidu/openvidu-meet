# Proposal

## Why

A reaction picked right after switching rooms can be sent to the previous room. A host page that leaves room A right after a reaction and joins room B within a second, then reacts, makes the client POST to room A with room B's token; the request fails with `403` and the reaction stays on the sender's screen while nobody else saw it.

## What Changes

- The reaction delivery loop reads the room and the local identity at each delivery instead of capturing them when the loop starts, so a reaction goes to the meeting that is current when it is sent.
- Leaving a meeting ends the loop of that meeting.
- No spec change: the fix makes "Send a reaction" hold (the reaction reaches everyone in the meeting the sender is in).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `reactions` "Send a reaction".

## Impact

- Meeting UI and embedded use (`<openvidu-meet>` remounted on another room): the reaction reaches the right room.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: `meeting-reactions.service.ts` of `shared-meet-components`.
- openvidu.io: none.

## Decisions to confirm

- A reaction picked in the new meeting while the previous meeting's one-second cooldown still runs. Proposed: it is sent after the cooldown, to the new room. Alternative: `clear()` also resets the cooldown so it is sent at once.

## Source

3.10.0 pre-release audit, finding IM-8 (low, static-plausible), introduced by #117.
