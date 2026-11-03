# Proposal

## Why

In the compact toolbar the eight reactions open as a block of emojis at the top of the More options menu: the menu grows
by two rows as soon as it opens and pushes Raise hand and the other options down, with nothing saying what the block is or
how long a reaction lasts.

## What Changes

- In the compact toolbar, the More options menu shows one Reactions row; the eight reactions unfold from it as a tray,
  with the time everyone sees a reaction; the menu stays open until one is sent, and the tray folds whenever the menu closes.
- Specs: `reactions` "Reaction picker" changes from a grid inside More options to the unfolding row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reactions`: "Reaction picker".

## Impact

- Meeting UI: the compact toolbar. No contract change.
- Code: `meeting-toolbar-reactions-button` of `shared-meet-components`.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- openvidu.io: the reactions page, if it describes the grid (checked in the tasks).
