# Proposal

## Why

`raise-hand` says that raising a hand that is not the caller's own answers `409`, "whatever the caller's
permissions". A moderator and an API key get that `409`, but a participant without `participantHandLower`, such as
a speaker, gets `403 Insufficient permissions`: the route checks `participantHandLower` for any change to another
participant's hand, lowering and raising alike, before the meeting service can refuse the raise. A host application
cannot tell "you may not lower that hand" from "nobody may raise that hand".

Found by the 2026-11-06 black-box probe of the 3.10 features. Two related precedences the spec leaves open were
pinned down at the same time:

- A raise of someone else's hand in a room with no meeting running answered `409`; every other hand request in such
  a room answers `404`.
- With `raiseHand.enabled` false, "the server SHALL reject every raise with 403" reads as if it also covered a raise
  of someone else's hand, which answers the `409` of the ownership rule.

## What Changes

- `participantHandUpdate` checks `participantHandLower` only to lower another participant's hand. Raising another
  participant's hand answers `409` for every caller of the room, a speaker included, and the hand does not change.
- A room member token of another room keeps getting `403` for a raise of someone else's hand.
- The meeting service checks that the room has a meeting before refusing a raise of someone else's hand, so a room
  without a meeting answers `404` first.
- `raise-hand` spells out the three precedences: ownership `409` for every caller of the room, `403` for a token of
  another room, `404` for a room without a meeting before the `409`, and the feature switch's `403` only for the
  caller's own hand.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `raise-hand`: "Raise hand can be turned off per room", "Only its owner raises a hand" and "Hand request
  validation".

## Impact

- REST API: `participantHandUpdate` (public) answers `409` instead of `403` to a caller of the room without
  `participantHandLower` that raises another participant's hand, and `404` instead of `409` to a raise of someone
  else's hand in a room without a meeting. The OpenAPI already lists `403`, `404` and `409` for it, with the `409`
  example for a hand raised by someone else; its description now says that the `409` holds whatever the caller
  holds and that the feature switch's `403` covers the caller's own hand. No contract change.
- Embedded API: `participantHandRaise` only raises the local participant's own hand; not affected.
- Webhooks, meeting UI, console UI, deployment configuration: not affected.
- Related: `fix-hand-raise-with-other-room-token` handles a token of another room acting on the hand of its own
  identity; this change leaves that path as it is.
- openvidu.io: none. `docs/meet/features/meetings/raise-hand.md` already says that only its owner raises a hand.
