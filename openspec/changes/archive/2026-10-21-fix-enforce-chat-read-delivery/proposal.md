# Proposal

## Why

`chatRead` only hides the chat in the interface: every chat message is broadcast to all participants, so a
participant denied `chatRead` receives every message and reads it with a client that bypasses the interface.
The media server has no grant that blocks receiving data, so the permission is not enforced anywhere.

## What Changes

- The meeting addresses each chat message, through the media server's destination list, to the
  participants who hold `chatRead` when it is sent, read from their participant metadata, which only the
  server writes. The media server then never delivers the message to anyone else.
- A participant granted `chatRead` during the meeting receives the messages sent after the grant, as a late
  joiner does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-chat`: "Delivery and display" limits delivery to participants holding `chatRead`, with scenarios
  for a bypassing client and a grant during the meeting.

## Impact

- Meeting UI: no visible change for unmodified clients (they already hide the chat without `chatRead`).
- REST API, webhooks, embedded API, console UI, deployment configuration: none.
- Code: `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/services/chat/chat.service.ts`
  (the destination list of `publishData`).
- openvidu.io: none.

## Decisions to confirm

- Delivery is restricted by the sender's client addressing only `chatRead` holders through the media server,
  so the server never holds message contents. Alternative: relay chat through a Meet REST endpoint that
  checks `chatRead` on each recipient, as reactions do, at the cost of a server round trip per message.
- A modified sending client can still address a message to anyone; the rule protects participants from
  reading the chat they are denied, not from a sender who deliberately leaks it.
