# Proposal

## Why

A participant whose microphone is muted cannot try another microphone: the microphone selector is disabled while muted,
and turning the microphone off discards a pick. In a large meeting they must unmute to everyone first, which is what
trying a device before applying it was meant to avoid, although the trial never publishes anything.

## What Changes

- Depending on the decision below, the microphone selector of the Audio & video tab either stays disabled while muted
  (documented as such) or allows trying a microphone while muted, with the level meter following the picked one.
- No delta spec: the affected requirements ("Trying a device before applying it", "Discarding a device that was not
  applied") exist only on `origin/main` (added by #143). A task updates them to the chosen behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The requirements are not yet in `openspec/specs/` of this checkout.

## Impact

- Meeting UI: the microphone section of the Audio & video tab. No contract change.
- Code (option B only): the audio devices component and the device trial service of `shared-meet-components`, and the muted-microphone warnings that listen to the same capture.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Open product question. Option A: keep the current rule, the microphone cannot be tried while muted, and state it in the spec. Option B: allow trying a microphone while muted (the trial never publishes), keeping the pick until the panel closes or the participant unmutes and presses Apply; Apply on a muted track keeps it muted but stops the capture the muted-speaking warning listens to, which needs care.

## Source

3.10.0 pre-release audit, finding UI-4 (low, static-high), introduced by #143.
