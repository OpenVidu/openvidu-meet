# Proposal

## Why

The room wizard ties live captions to encryption only when the person toggles encryption in the Meeting step. Enabling recording in the Recording step turns encryption off, and disabling it turns encryption back on, without that rule running: a room can be created with captions off although nobody turned them off, or the form can show captions on while the server silently stores them off.

## What Changes

- The wizard applies the captions and encryption rule whenever the encryption value changes, so every path (the toggle and the Recording step) goes through one place.
- The server applies the encryption exclusion once, in the room service for creation and update, and no longer in both request schemas, so a direct caller of `createMeetRoom` (an extension of the backend) gets the same result.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `rooms` "Wizard dependent settings" (restoring each feature when encryption is turned off) and `room-config` "Rules across fields judge the resulting config".

## Impact

- Console UI: the room wizard.
- REST API: `createRoom` and `updateRoomConfig` results are unchanged; the rule is applied in one place.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code: `meeting-config.component.ts` and `recording-config.component.ts` of the room wizard in `shared-meet-components`; `room.schema.ts` and `room.service.ts` in `meet-ce/backend`. The backend rule stays a seam for the PRO edition's service overrides.
- openvidu.io: none.

## Decisions to confirm

- Where the backend rule lives. Proposed: in `createMeetRoom` and `updateMeetRoomConfig` of the service, dropped from the schemas. Alternative: keep it in the schemas and have the service call the same helper for direct callers.

## Source

3.10.0 pre-release audit, findings MT-9 (low, static-high, spec mismatch) and MT-10 (low, static-high, code), introduced by #133.
