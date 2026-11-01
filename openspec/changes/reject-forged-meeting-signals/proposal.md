# Proposal

## Why

Any participant allowed to chat can publish on the media server's data channel, and therefore on the
topics the server uses for its own meeting signals: the recording state, the moderator mute, the
reaction relay and the permission refresh. The meeting ignores such a signal when it can tell the
sender is a participant, but it tells by looking the sender up in its own participant list, so a
signal from a participant the receiver does not list yet is taken as coming from the server. A
forged mute or recording state then reaches everyone. The fix must also hold in rooms with
end-to-end encryption, where the media server cannot see a packet's topic.

## What Changes

- The meeting accepts a server signal only when the media server delivered it as sent by the server:
  with no participant identity and not end-to-end encrypted. Both facts are set by the media server
  or by the absence of the meeting key on the server, never by the sender.
- Every other packet on a server signal topic is discarded, whatever the receiver knows about its
  sender, in rooms with and without end-to-end encryption.
- No change to the media server, to the grants, or to the chat. Restricting which topics each
  participant may publish (the OpenVidu LiveKit fork work) stays a separate, optional step.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meetings`: a new requirement states the meeting-wide rule that server signals are honored only
  when they come from the server, including encrypted rooms and senders the receiver does not list.
  The per-feature requirements in `meeting-moderation` ("Only the server can mute a participant") and
  `reactions` ("Send a reaction") stay as they are and are now covered in every case.

## Impact

- **REST API**: none.
- **Webhooks**: none.
- **Embedded API**: none.
- **Meeting UI**: a forged server signal (recording state, moderator mute, reaction, permission
  refresh) from a participant the receiver does not list yet no longer has any effect. Nothing else
  a participant sees changes.
- **Console UI**: none.
- **Deployment configuration**: none.
- **openvidu.io**: none; no page describes how meeting signals are authenticated.
- **PRO**: no extension seam involved.
