# Proposal

## Why

Meet asks for the audio of a shared screen with `audio: true`, and Chrome then delivers it like a
microphone: mono, with echo cancellation, noise suppression and automatic gain control. Those filters
are tuned for a voice in front of a microphone, so the soundtrack of a shared video or music is
filtered as if it were speech. They also keep the encoder busy on silence: the WebRTC audit of
2026-10-30 measured a shared tab that plays nothing at 58 to 74 kbps sent and about 60 kbps received
by every other participant, because the echo canceller never outputs digital silence and silence
suppression (DTX) never engages. Captured without that processing, the same silent tab sends 0.9 kbps
and each viewer receives 0.6 kbps, and Chrome delivers the tab audio in stereo.

## What Changes

- The audio of a shared screen is captured without echo cancellation, noise suppression and automatic
  gain control, so it reaches the others as the shared tab plays it.
- Meet asks the browser to leave the meeting's own audio out of a captured system audio
  (`restrictOwnAudio`), so sharing the entire screen with its sound does not send the other
  participants' voices back to them. Tab sharing never had that risk: Meet excludes its own tab.
- Replacing the shared screen captures the new one the same way.
- The microphone, the camera and the bitrate the screen audio is published at do not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-media`: a new requirement states how the audio of a shared screen is captured.

## Impact

- **Meeting UI:** shared tab or system audio sounds as played, without voice filtering; a silent
  shared tab costs almost nothing. Applies where the browser shares screen audio (Chromium-based
  browsers; Firefox and Safari share no screen audio).
- **REST API, webhooks, embedded API, console UI, deployment configuration:** no change; no public
  contract changes.
- **Code:** frontend library only (`shared-meet-components`), the capture options of the screen
  share service. No new dependency.
- **Risk to verify before merging:** sharing the entire screen with system audio on Windows, where the
  meeting's own audio would come back as echo if the browser does not honor `restrictOwnAudio`. The
  pull request stays a draft until that check is done on a Windows machine.
- **PRO:** no overridable signature changes.
- **openvidu.io:** no page documents screen-share audio; none changes.
