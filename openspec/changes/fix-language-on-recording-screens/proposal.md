# Proposal

## Why

`language` (new in 3.10.0) is applied only when an entry goes through the room's meeting entry:

- The webcomponent ignores it on every recording screen: with `recording-url`, with `show-recording`, and with `show-only-recordings`, which go straight to the recording routes. Worse, a language set by an earlier entry of the same element stays applied there.
- The iframe and the direct link apply it when a room URL redirects to a recording screen (`show-recording`, `show-only-recordings`), but ignore it when their URL is a recording URL.

So the same attribute gives a different language depending on the embedding mode and on how the recording was reached. The `localization` spec only speaks of meeting entries.

## What Changes

- `language` applies to every entry, a meeting or a recording screen, in the webcomponent, the iframe and the direct link alike, including an iframe or direct link whose URL is a recording URL.
- An entry to a recording screen without `language` uses the stored preference again, as a meeting entry does.
- `show-language-selector` keeps its meaning; recording screens have no language selector, so it has no visible effect there.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `localization`: "Language requested by the host" covers recording screens, in every embedding mode.

## Impact

- Embedded API: `language` on the webcomponent recording routes, and as a query parameter of a recording URL in an iframe or a direct link. Additive: no attribute is added or renamed.
- Meeting UI: none. Recording view and room recordings page: shown in the requested language.
- REST API, webhooks, console UI, deployment configuration: not affected.
- Code: the recording and room-recordings entry services and their SPA guards, and the webcomponent route resolution, of the `shared-meet-components` library.
- openvidu.io: none beyond the regenerated attribute reference (see tasks); the iframe and direct link pages defer to the attribute list.

## Decisions to confirm

- `language` applies to recording screens in every mode (proposed). Alternative: document it as meeting-only and stop applying it on the iframe and direct link redirects to recordings.
- A recording URL in an iframe or a direct link accepts `language` as a query parameter (proposed), the first embedded attribute a recording URL accepts besides its own `recordingSecret`. Alternative: only room URLs accept it.
