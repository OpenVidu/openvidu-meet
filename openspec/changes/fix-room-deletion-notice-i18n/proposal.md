# Proposal

## Why

After a room is deleted from the console, the notice and the error dialog show the server's English message, with the
room id cut out of it, even when the console is in another language. The same holds for the "closed instead of deleted"
and failure messages, on the room detail page and on the Rooms page.

## What Changes

- The console shows the room deletion outcomes (deleted, closed instead of deleted, failed) from translation keys
  chosen by the server's success or error code, in the selected language, and stops post-processing the server message.
- Specs: `localization` gains the requirement "Console notices follow the language".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `localization`: adds "Console notices follow the language".

## Impact

- Console UI: the room detail page and the Rooms page notices and deletion error dialog, in all 10 languages. No contract change.
- Code: the room deletion service and the room detail and rooms pages of `shared-meet-components`, and the rooms translation bundle (removing the message cleanup helper).
- REST API, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- None.

## Source

3.10.0 pre-release audit, finding UI-7 (low, static-high), introduced by #124.
