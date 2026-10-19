# Proposal

## Why

In an end-to-end encrypted room the display names travel encrypted and each participant's meeting decrypts them with the meeting's key before showing them. The raised-hand notice that holders of `participantHandLower` get takes the name straight from the media server's participant instead of the decrypted one, so in an encrypted meeting it shows the ciphertext ("Xk9f...raised their hand").

## What Changes

- The raised-hand notice names the participant as the rest of the meeting does: the decrypted name, or `******` when the participant's key differs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `raise-hand`: new requirement "Raised-hand notice in encrypted meetings".

## Impact

- Meeting UI: the raised-hand notice in encrypted rooms. No contract change.
- REST API, webhooks, embedded API: not affected (they carry the encrypted name by design, see `meeting-media` "Encrypted names reach the server encrypted").
- Console UI, deployment configuration: not affected.
- openvidu.io: no page changes.
