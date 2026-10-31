# Proposal

## Why

Meet publishes the microphone with livekit-client's default audio profile, `music`, which lets Opus use
up to 48 kbps, and RED (redundant audio) roughly doubles it on the wire. The WebRTC audit of
2026-10-30, measured with OpenVidu Dashboard and `getStats()`, found that a speaking participant sends
84 kbps and a participant with an open but silent microphone sends 57 kbps: silence suppression (DTX)
is enabled but never engages, because the echo canceller's output is never digital silence. Every
other participant receives each open microphone, so in a 6-person meeting each participant downloads
300 kbps of audio, 223 kbps of it the silence of the four who are not talking. On a constrained
downlink that audio competes with video: in the 1 Mbps test it was 190 of the 900 kbps available.

Measured with the speech profile (24 kbps) and RED kept: a speaker sends 47 kbps (-44%) and a silent
open microphone 26 kbps (-54%), so the 6-person download drops from about 300 to about 140 kbps.
RED stays because it is what hides packet loss: with 3% loss it left no audio to conceal, against
2.9% concealed without it.

## What Changes

- The microphone is published with the speech audio profile (Opus capped at 24 kbps) instead of the
  music profile (48 kbps). Redundant audio (RED) and silence suppression (DTX) stay as they are.
- The audio of a shared screen keeps the default music profile: only the microphone changes, so
  music or a video played in a shared tab keeps its bitrate.
- The meeting library's media profile model, which no code uses and which describes a publish
  profile Meet does not apply, is deleted.
- Out of scope: joining large rooms muted by default, and the screen-share audio processing found by
  the same audit. Each is its own decision.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-media`: a new requirement states the audio quality the microphone is published at, and
  that the audio of a shared screen is not limited to it.

## Impact

- **Meeting UI:** every participant's microphone is sent at speech quality. Voice quality stays at
  Opus speech level; music played into a microphone loses fidelity.
- **REST API, webhooks, embedded API, console UI, deployment configuration:** no change; no public
  contract changes.
- **Recordings:** they record the microphone at the bitrate it is published with, so recorded voices
  use the speech profile too.
- **Code:** frontend library only (`shared-meet-components`), at the single place where the camera
  and the microphone are published, plus the deletion of the unused media profile model. No new
  dependency.
- **PRO:** no overridable signature changes.
- **openvidu.io:** no page documents the audio bitrate; none changes.
