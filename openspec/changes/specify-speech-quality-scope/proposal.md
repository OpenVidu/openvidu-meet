# Proposal

## Why

The 24 kbps speech cap on the microphone also applies to recordings and live broadcasts, which carry the microphone as
it is published, and to music played into a microphone (lessons, rehearsals), with no room or embedded option to opt
out. The release note only says the microphone is sent at speech quality.

## What Changes

- Depending on the decision below, the 3.10.0 line and the documentation state that recordings and broadcasts carry
  the speech-quality audio, or a later change adds an opt-out (such as a room or embedded setting for a music profile).
- No delta spec: the requirement "Microphone audio quality" of `meeting-media` exists only on `origin/main` (added by
  #145). A task updates it if the decision calls for it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The requirement is not yet in `openspec/specs/` of this checkout.

## Impact

- Documentation only for option A; option B would add a room configuration or embedded attribute (additive) and is a separate change.
- REST API, webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected by this change.
- openvidu.io: the meeting media and recordings pages state the speech-quality cap if option A is chosen.

## Decisions to confirm

- Open product question. Option A: keep the cap for every microphone use and say so in the CHANGELOG line, the spec and the openvidu.io pages (recordings and broadcasts included). Option B: keep the cap by default and plan an opt-out for music (a per-room or embedded setting), tracked as its own change.

## Source

3.10.0 pre-release audit, finding UI-5 (low, static-high), introduced by #145.
