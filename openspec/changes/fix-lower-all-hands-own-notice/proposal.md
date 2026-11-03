# Proposal

## Why

Lower all hands attributes every hand it lowers to a moderator, the caller's own included. A moderator who raised their hand and then presses Lower all hands, or whose host calls `participantHandLowerAll`, is told "A moderator lowered your hand" for their own action, and the `participantHandChanged` event and webhook of their own hand carry `origin` `moderator`. Everywhere else, lowering the own hand is attributed to the participant.

## What Changes

- `participantHandLowerAll` attributes the caller's own hand to the participant (`origin` `participant` in the `participantHandChanged` webhook and embedded event) and every other hand to a moderator, as today. With the API key, which acts as no participant, every hand stays attributed to a moderator.
- The moderator who lowers every hand no longer sees "A moderator lowered your hand"; the meeting already shows that notice only for an `origin` of `moderator`, so the meeting code does not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `raise-hand`: "Lower every hand" attributes the caller's own hand to the participant, with a scenario for a caller whose hand is up. With it, "A participant is told when someone else lowers their hand" holds for this case too.

## Impact

- REST API: `participantHandLowerAll` keeps its contract; only the attribution of the caller's own hand changes, and its OpenAPI description says so.
- Webhooks: `participantHandChanged` for the caller's own hand carries `origin` `participant` instead of `moderator`. The value already exists; no contract change.
- Embedded API: the `participantHandChanged` event of `participantHandLowerAll` follows the webhook; no contract change.
- Meeting UI: the "A moderator lowered your hand" notice no longer appears for the caller's own hand.
- Console UI, deployment configuration: not affected.
- Code: `lowerAllHands` in `meet-ce/backend/src/services/meeting.service.ts`.
- openvidu.io: the regenerated REST API reference (`docs/meet/embedded/reference/api.html`); `docs/meet/features/meetings/raise-hand.md` does not describe the attribution of lowering every hand and stays.

## Decisions to confirm

- The caller's own hand is attributed to the participant in the webhook and the event as well as in the notice. Proposed: yes, by the server, so every surface agrees. Alternative: keep `origin` `moderator` for every hand, as "Lower every hand" says today, and have the calling meeting skip the notice for its own hand.

## Source

3.10.0 pre-release audit, finding IM-4 (low, static-high), introduced by #109.
