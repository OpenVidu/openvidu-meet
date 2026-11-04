# Design

## Context

The server sends its meeting signals (`MeetSignalType`: `meet_recording_updated`,
`meet_participant_permissions_updated`, `meet_participant_media_muted`,
`meet_participant_reaction_sent`) through LiveKit's server API as data packets. Participants holding
`chatWrite` hold LiveKit's `canPublishData`, which is all or nothing, so they can publish on those
topics too.

`MeetingEventsService.subscribeToDataMessage` guards them with `if (participant)`, discarding what a listed participant relays. Chat travels as a text stream, which needs the same `canPublishData`.
`participant` is the `RemoteParticipant` that `livekit-client` resolved from its roster, so it is
`undefined` both for a server packet and for a packet whose sender the receiver does not list yet
(the gap recorded as M12 in the Phase 5 findings). A forged signal in that window passes as the
server's.

What the media server guarantees, observed in the OpenVidu LiveKit fork:

- For every packet a participant publishes, the SFU overwrites the sender identity with the real one
  (`overrideSenderIdentity` in `pkg/rtc/participant.go`), encrypted packets included. Only a hidden
  participant is stamped with an empty identity, and Meet never issues hidden grants.
- Packets the server sends (`Room.SendDataPacket`) carry no participant identity.
- The server has no end-to-end encryption key, so its packets are never encrypted.

`livekit-client` 2.22.4 already hands both facts to the listener: `RoomEvent.DataReceived` passes
`(payload, participant, kind, topic, encryptionType, participantIdentity)`, where
`participantIdentity` is the identity the SFU stamped, independent of the roster.

## Goals / Non-Goals

**Goals:**

- Decide whether a signal comes from the server from facts the sender cannot control.
- Hold in rooms with end-to-end encryption, where the SFU cannot read a packet's topic.

**Non-Goals:**

- Restricting which topics a participant may publish. That is the optional OpenVidu LiveKit fork
  work (topic allow-list for plain packets, a separate permission for encrypted ones), recorded in
  the `chat-history-persistence` design.
- Changing the chat path, the grants or the server's way of sending signals.

## Decisions

### D1. Authority from the SFU stamp and the encryption type, not the roster

A packet on a `MeetSignalType` topic is processed only when `participantIdentity` is empty and
`encryptionType` is `Encryption_Type.NONE`. Anything else on those topics is discarded with a warning
log naming the stamped identity.

Why both conditions: an empty stamp alone would accept a packet from a hidden participant; plain
encryption alone would accept a forged plaintext packet. Together they describe exactly what the
server can produce and nothing a participant can.

Alternatives considered:

- **Keep the roster lookup and wait for the sender to appear**: still a race, and it delays every
  legitimate signal decision on roster timing.
- **Sign the server's signals** (a key the client fetches at join): robust and transport-independent,
  but adds key distribution and replay protection for a guarantee the SFU stamp already gives.
- **Topic allow-list in the fork**: cannot see topics of encrypted packets, and is a media server
  change; it remains a complement, not the fix.

### D2. One guard for every server signal

The check stays in the single place every data packet enters the meeting, before any topic is
dispatched, so recording state, mute, reactions and permission refresh are covered at once and a new
`MeetSignalType` is covered by construction. Chat travels as a text stream, with its own handler that keeps resolving the sender
from the roster.

### D3. Several replicas

Purely client-side; replicas only send signals through LiveKit and are unaffected.

## Risks / Trade-offs

- [LiveKit's server API starts stamping an identity on server packets in a future version] → Every
  legitimate signal would be dropped; the e2e check that a recording start updates the indicator and
  that a moderator mute applies, in rooms with and without encryption, catches it on upgrade.
- [Meet starts issuing hidden grants to a participant that publishes data] → The empty-stamp rule
  would accept its packets; a hidden publisher must then be ruled out explicitly. Recorded here so a
  future hidden grant is reviewed against this guard.
- [A `livekit-client` upgrade drops the extra `DataReceived` arguments] → They are part of the public
  event signature in 2.22. A missing `encryptionType` is treated as not `NONE`, so the guard fails
  closed: signals would stop applying, which the e2e checks above catch, instead of forged ones
  starting to apply.

## Migration Plan

Client-only change, shipped with the frontend and webcomponent bundles. No data, configuration or
rollback concerns.
