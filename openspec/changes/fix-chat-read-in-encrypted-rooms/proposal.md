# Proposal

## Why

In a room with end-to-end encryption, a chat message still reaches participants who do not hold `chatRead`, in exactly the rooms that ask for confidentiality. The list of recipients travels inside the encrypted message, so the media server cannot read it and delivers the message to everyone, and every participant holds the key.

## What Changes

- Chat messages are sent so that the media server sees their recipients even in an encrypted room, and received the same way: only participants holding `chatRead` get them, with or without encryption.
- `chatRead` keeps binding the stock client's senders only: a sender with a modified client that omits the recipients still broadcasts. This stays as the accepted limitation of the archived change `fix-enforce-chat-read-delivery` (decision below).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-chat`: new requirement "chatRead holds in encrypted meetings", next to "Delivery and display" and "Chat in encrypted meetings".

## Impact

- Meeting UI: chat sending and receiving of the shared components library; messages, ordering and display are unchanged.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: `chat.service.ts` of `meet-ce/frontend/projects/shared-meet-components`. Any other reader of the `chat` data topic (a text stream handler can be registered once per topic) has to move with it.
- openvidu.io: none.

## Decisions to confirm

- Senders that bypass the recipient list (finding RM-9). Proposed: keep the limitation; `chatRead` binds the stock client's senders and modified receivers. Alternative: a server relay that owns the recipient list, as reactions do (adds load on the REST path and a rate limit to design).
- Messages sent as data streams instead of data packets. Proposed: the stock client switches for every room, so one path serves encrypted and plain rooms. Alternative: only encrypted rooms (two paths to maintain).

## Source

3.10.0 pre-release audit, findings RM-2 (medium, verified-live) and RM-9 (low, static-high), introduced by #131.
