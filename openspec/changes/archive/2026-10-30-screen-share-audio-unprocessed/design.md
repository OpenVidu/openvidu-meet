# Design

## Context

`ScreenShareService.captureOptions()` is the one place that describes a screen capture, used both to
start sharing (`setScreenShareEnabled`) and to replace the shared screen (`createScreenTracks` in
`switch()`). It passes `audio: true`, which livekit-client hands to `getDisplayMedia` unchanged.
Chrome then applies its microphone defaults to the display audio. Measured in Chrome 156: with
`audio: true` a shared tab's audio track reports `channelCount: 1` and `echoCancellation`,
`noiseSuppression` and `autoGainControl` all `true`; with the three set to `false` it reports
`channelCount: 2` and all three `false`.

## Goals / Non-Goals

**Goals:**
- Shared screen audio captured as played, from both the start and the replacement of a share.
- No echo of the meeting's own audio when the shared audio is the system audio.

**Non-Goals:**
- The bitrate the screen audio is published at: it keeps livekit-client's default `music` preset
  (48 kbps, now in stereo). Raising it to a stereo preset is a separate decision.
- Whether a participant shares audio at all: the browser's own picker keeps that choice.

## Decisions

**Turn the processing off in the capture constraints.** `audio: { echoCancellation: false,
noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true }` replaces `audio: true`.
The constraints are set before the participant picks the surface, so they cannot depend on it; they
must be right for a tab, a window and the entire screen alike. Alternative considered: keeping the
processing and only enabling DTX harder; rejected because DTX is already on and it is the echo
canceller's output that keeps it from engaging.

**`restrictOwnAudio` instead of the echo canceller for system audio.** A tab never carries the
meeting audio (Meet passes `selfBrowserSurface: 'exclude'`) and a window carries no audio in Chrome.
Only the entire screen with system audio (Windows, ChromeOS, and macOS 14.2 or later with Chrome 141
or later) contains what the meeting plays. `restrictOwnAudio` asks the browser to leave the capturing
page's own playback out of that capture. It is passed as a plain constraint, so a browser or surface
that does not support it ignores it: a tab capture in Chrome 156 lists it as `[false]` in its
capabilities and still captures.

## Risks / Trade-offs

- [Chrome does not honor `restrictOwnAudio` for system audio, so sharing the entire screen with its
  sound echoes the other participants] → verified by hand on macOS 15 (task 1.4): the page's own
  playback stays out of the capture and other applications' audio does not. Windows was not verified.
  If it echoes there, the way out is the capture options, not the captured track: Chrome rejects
  changing the processing of a captured audio track (`OverconstrainedError`), so echo cancellation
  cannot be turned back on for the entire screen alone after the participant picks it.
- [Unfiltered system audio also carries notification sounds and other applications] → that is what
  sharing system audio means; the browser's picker already lets the participant leave the audio out.
- [Louder shared audio without automatic gain control] → the participant controls the source
  volume; the others' own volume controls still apply.
