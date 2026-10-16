# Proposal

## Why

The chat messages of a meeting are kept in a service that lives as long as the page, and nothing empties it when the participant leaves. A participant who leaves a meeting and joins another one with the same `<openvidu-meet>` element finds the previous meeting's messages in the chat panel and, because the toolbar counts every stored message as new when it is created again, an unread count on the chat button.

## What Changes

- The meeting's chat messages are discarded when the meeting view is torn down, together with the rest of the per-meeting state (participants, devices), so every entry starts with an empty chat and no unread count.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `meeting-chat` spec already states the intended behavior; this change makes it pass:

- `meeting-chat` / Requirement "Messages last only the meeting" / Scenario "Next meeting in the same tab".
- `meeting-chat` / Requirement "New-message notice" / Scenario "No messages yet".

## Impact

- Meeting UI: the chat panel and the chat button's unread count start empty on every entry with the same webcomponent. The standalone app and the iframe load the page again on every entry, so they never kept the messages. No contract change.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- Frontend library: the chat service and the meeting view teardown.
- openvidu.io: no page changes.
