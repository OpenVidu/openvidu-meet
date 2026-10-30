# Proposal

## Why

End-to-end encryption encrypts each participant's audio on their device, so only participants holding the key can decode it. The live captions assistant is a media-server agent without the key: in an encrypted room it receives only encrypted audio and cannot transcribe it, yet nothing stops a room from having both `e2ee.enabled` and `captions.enabled`, and its meeting offers a captions button that never produces captions. Recording, which has the same limitation, is already turned off in encrypted rooms.

## What Changes

- The server stores `captions.enabled` as `false` whenever the room's `e2ee.enabled` is `true`, at creation and on every config update, judged on the resulting config, exactly as it does for `recording.enabled`.
- A forward-only room migration turns `captions.enabled` off in existing rooms that have encryption on.
- The console room wizard keeps encryption and live captions mutually exclusive, as it does with recording, restoring the captions toggle when encryption is turned off again, and warns that live captions are unavailable while encryption is enabled, as it already warns for recording.
- The meeting needs no change: it already hides the captions button of a room whose `captions.enabled` is `false`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-captions`: new requirement "Live captions and end-to-end encryption exclude each other".
- `room-config`: the requirement "Rules across fields judge the resulting config" lists the new rule.
- `rooms`: the requirement "Wizard dependent settings" adds captions to the wizard's exclusivity with encryption.

## Impact

- REST API: `createRoom` and `updateRoomConfig` store `captions.enabled: false` for encrypted rooms instead of the value sent, as they already do for `recording.enabled`; `getRoomConfig` and room responses report it. No schema change.
- Webhooks: payloads carrying the room config (`meetingStarted`, `meetingEnded`) show `captions.enabled: false` for encrypted rooms. No schema change.
- Meeting UI: encrypted rooms show no captions button. Console UI: the room wizard's captions toggle turns off and is disabled while encryption is on, with a warning saying why, and the encryption restrictions list live captions next to recording.
- Embedded API, deployment configuration: not affected.
- Backend: room config schemas, room service update path, a room migration (schema version bump).
- openvidu.io: `docs/meet/features/meetings/e2e-encryption.md` lists live captions among the E2EE limitations next to recording, and `docs/meet/features/meetings/live-captions.md` gets the same mutual-exclusion notice as `docs/meet/features/recordings/configuration.md`.

## Decisions to confirm

- Encryption turns captions off in the stored config, mirroring recording (alternative: keep `captions.enabled` as configured and only refuse the assistant and hide the button at runtime while `e2ee.enabled` is `true`, with no migration but a config that reads "captions on" for a room that never offers them).
- Existing encrypted rooms with captions on are migrated to captions off (alternative: leave them and apply the rule only on the next config write).
