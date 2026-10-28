# Proposal

## Why

Every chat message received from another participant raises the "new message" notice, plays the message sound and adds to the toolbar's unread count, whether or not the participant can read the chat. A participant without `chatRead`, or anyone in a room whose `chat.enabled` is `false`, hears and sees a notice for messages they cannot read, and the notice offers an action that opens a chat panel that should not exist for them.

## What Changes

- A received chat message is ignored, without notice, sound, unread count or storage, while the local participant cannot read the chat: the room has `chat.enabled` set to `false` or the participant lacks `chatRead`. The meeting already computes that condition to show or hide the chat button; the chat reuses it.
- Gaining `chatRead` during the meeting shows the messages received from then on; messages received while it was denied are not kept.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `meeting-chat` spec already states the intended behavior; this change makes these scenarios pass:

- `meeting-chat` / Requirement "Reading the chat needs chatRead" / Scenario "Participant without chatRead".
- `meeting-chat` / Requirement "Room chat switch" / Scenario "Chat disabled" (no chat panel can be opened, now also not through the notice).

## Impact

- Meeting UI: participants who cannot read the chat get no message notice, sound or unread count. No contract change.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected. The server still delivers the data messages; enforcing `chatRead` at the media server is a separate finding.
- Frontend library: the chat service reads the chat button visibility the meeting already derives from `chat.enabled` and `chatRead`.
- openvidu.io: no page changes.

## Decisions to confirm

- Messages received while the participant cannot read the chat are dropped, so a participant granted `chatRead` mid-meeting sees only later messages (alternative: keep them silently and show them once `chatRead` is granted).
