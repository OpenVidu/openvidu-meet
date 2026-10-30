# Design

## Context

The meeting library publishes the camera and the microphone in one place, the local media service, by
calling `publishTrack(track)` with no options, so livekit-client merges in the Room's `publishDefaults`.
Meet's `publishDefaults` only set `stopMicTrackOnMute: false`; everything else is livekit-client's
default (`audioPreset: music`, `red: true`, `dtx: true`). Screen sharing is published separately,
through `setScreenShareEnabled`, and also falls back to `publishDefaults`.

## Goals / Non-Goals

**Goals:**
- The microphone publication carries `audioPreset: AudioPresets.speech` (24 kbps), with RED and DTX
  untouched.
- The preset survives everything that re-sends the microphone: mute and unmute, device switch and a
  full reconnect.

**Non-Goals:**
- Making the profile configurable per room.
- Any change to screen-share audio, the camera, or the capture constraints.

## Decisions

**Per-track publish option, not `publishDefaults`.** `publishDefaults.audioPreset` would also apply
to the screen-share audio, which goes through the same option merge, and would cap a shared video's
soundtrack at 24 kbps. Passing the preset as the publish option of the microphone track only keeps
the screen share on the default. Alternative considered: setting it in `publishDefaults` and passing
`music` explicitly when sharing the screen; rejected because it spreads one decision over two places.

**The preset survives without extra code.** Mute and unmute act on the same publication, a device
switch restarts the track inside it, and livekit-client's full reconnect republishes every track with
the options it was first published with (`pub.options`). So the single publish call is the only
place to change.

**The unused media profile model is deleted, not wired.** `models/media-profile.model.ts` describes a
publish profile (`DEFAULT_MEDIA_PROFILE`, a browser-storage override key) that nothing imports, in CE
or PRO, and that disagrees with what Meet applies. Wiring it would mean a configurable profile, which
is a product decision this change does not take; leaving it would keep a second, wrong description of
the publish settings next to the real one.

**RED and DTX stay on.** RED is what hides packet loss (0% concealed audio at 3% loss against 2.9%
without it), and with the speech preset a speaker with RED costs less (47 kbps) than one without RED
on the music preset (45 kbps plus no protection). DTX does not engage on an open microphone because of
the echo canceller, but it costs nothing and still works on silent input.

## Risks / Trade-offs

- [Music played into a microphone sounds worse at 24 kbps] → accepted: the microphone carries voice;
  music shared from a tab keeps its own track and bitrate.
- [Recordings capture the microphone at the published bitrate] → Opus at 24 kbps is full-quality
  speech; the recording encoder re-encodes the mix anyway.
- [The live result depends on livekit-client applying the preset as the sender's `maxBitrate`] →
  verified end to end with the audit harness, which reads the sent bitrate from `getStats()`.
