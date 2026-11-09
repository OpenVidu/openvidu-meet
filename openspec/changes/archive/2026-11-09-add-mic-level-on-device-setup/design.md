# Design

## Context

- `MicActivityService` (meeting domain) already meters the local microphone track and exposes `level` (a signal, 0 to 1), `active` and `systemMuted`. It feeds the speaking-while-muted warning.
- The device setup screen (`meeting-media-setup.component`) renders the microphone button as one control: the microphone icon and a menu arrow that opens the device list.
- `ov-audio-wave` exists for participant tiles and the settings panel; it draws sticks, not a fill, and is not reused here.

## Goals / Non-Goals

**Goals:**
- A participant sees, before joining, that the selected microphone picks up sound.
- The controls keep the current corner radius: the level is only a fill behind the microphone icon.

**Non-Goals:**
- The meeting toolbar's microphone button.
- Showing a level for remote participants.

## Decisions

- **Split controls.** Each device control is a Material 3 split button: a toggle (56 by 48 px) and a menu button (36 by 48 px) side by side with a 2 px gap, tonal (the theme's primary action color), fully rounded outer corners and 4 px inner ones, no frame and no border. The background effects button is a single round tonal button. Two real buttons replace the single combined one: the toggle turns the device on or off and the menu opens the device list.
- **The fill is a transform.** A layer at the bottom of the microphone toggle, clipped by its rounded corners, with `transform: scaleY(level)` and a short transition, bound to `MicActivityService.level`. A transform does not trigger layout, and the signal only marks the button dirty (OnPush). The top edge is rounded so it reads as a wave.
- **Menu button always present.** The menu button stays while the device is off, so the control does not shrink and grow; a device picked while off is remembered and used when the device is turned on.
- **Level scale.** The meter is logarithmic (-70 dBFS empty, -20 dBFS full) over float samples, so a quiet room already moves the fill. The context is resumed explicitly, since one created before any interaction starts suspended.
- **Themes.** The buttons and the badge border use the theme tokens, and the language button of the device setup screen is a plain button on the surface tokens; the off state and the fill use fixed colors that keep their contrast in both.
- **No level when there is nothing to hear.** The fill is hidden while the microphone is off (`active` false) or muted by the system (`systemMuted`).
- **Accessibility.** The fill is decorative (`aria-hidden`). The button's accessible name adds "picking up sound" while the level is above the speaking threshold, debounced so screen readers are not flooded.
- **One place.** The fill lives in the device setup microphone control, so every screen built on it gets it without its own code.

## Risks / Trade-offs

- [Constant repaints while speaking] → One composited transform per frame on one element; the meter already runs.
- [Low-contrast fill on the dark button] → The fill uses the accent at about 40 % opacity, under the white icon, which keeps its contrast.

## Migration Plan

None: UI only.
