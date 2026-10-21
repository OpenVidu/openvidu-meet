# Design

## Context

Chat messages travel as LiveKit data packets published by the sender's client with topic `chat` and no
destination, which LiveKit forwards to every participant of the room. LiveKit grants can stop a participant
from publishing data (`canPublishData`, used for `chatWrite`) but have no flag that stops one from
receiving data. Each participant's LiveKit metadata carries their Meet permissions; the server writes it
and no participant can change their own (`canUpdateOwnMetadata` is never granted), so every client reads
the other participants' permissions reliably.

## Goals / Non-Goals

**Goals:**
- A participant without `chatRead` receives no chat message from an unmodified sender, whatever their own
  client does.

**Non-Goals:**
- Stopping a modified sender from leaking messages to someone without `chatRead`.
- History for participants granted `chatRead` later (the chat keeps no history, see "Messages last only the
  meeting").

## Decisions

### Addressing by destination identities

`ChatService.sendMessage` publishes with `destinationIdentities` set to the identities of the remote
participants whose parsed metadata grants `chatRead`. LiveKit forwards a packet with a destination list
only to those identities (`BroadcastDataPacketForRoom` skips every other participant). A message with no
eligible recipient is shown locally and not published. Participants without Meet metadata (the recorder,
agents) are left out, as they do not read the chat.

Alternative: a server relay endpoint that publishes each message to the eligible participants with the
server SDK. It also centralizes the check, but adds a REST round trip and server load per message and puts
message contents through Meet. Rejected unless the user prefers it (proposal "Decisions to confirm").

### Encrypted rooms

The payload is encrypted by the sender's client before publishing, as today; the destination list is
outside the payload and does not change encryption.

## Risks / Trade-offs

- [The sender's view of others' permissions lags a promotion or permission change by the metadata update]
  → The window is the LiveKit metadata propagation delay, the same one the participants panel already
  shows; a message sent in it reaches the previous set of readers.
- [Large meetings make the destination list long] → It is bounded by the participants in the meeting and is
  computed per message from the participants list the client already holds.
- Several Meet replicas: no server state is involved; the media server does the routing.
