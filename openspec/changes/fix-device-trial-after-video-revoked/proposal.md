# Proposal

## Why

A participant who is trying another camera in the meeting settings and then loses the permission to publish video (a
moderator demotes them, or their room member permissions change) keeps the tried camera capturing, with the camera
light on, and the Apply button stays visible. Pressing it would switch a camera the participant may no longer publish.

## What Changes

- The pick of a device kind is discarded, closing its capture, when the permission to publish that kind is revoked and
  its section disappears from the Audio & video tab; the other kind's pick is kept.
- No delta spec: the requirement "Discarding a device that was not applied" of `meeting-media` exists only on
  `origin/main` (added by #143). A task adds the permission revocation to its list of discards.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The requirement to extend is not yet in `openspec/specs/` of this checkout.

## Impact

- Meeting UI: the Audio & video tab of the settings panel. No contract change.
- Code: the Audio & video settings component and the device trial service of `shared-meet-components` (a discard on the section's visibility, next to the existing discards).
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- None.

## Source

3.10.0 pre-release audit, finding UI-3 (low, static-high), introduced by #143.
