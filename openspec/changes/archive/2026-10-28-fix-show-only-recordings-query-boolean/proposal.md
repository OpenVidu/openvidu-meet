# Proposal

## Why

A room URL opened in an iframe or through a direct link reads `show-only-recordings` as `true` only when its value is exactly `true`. A bare parameter (`?show-only-recordings`) or any other value (`=1`, `=yes`) shows the meeting, while the same attribute on `<openvidu-meet>` shows the room recordings page. The `embedded-api` boolean rule already says otherwise; the code is the one that is wrong.

## What Changes

- The iframe and direct link read the `show-only-recordings` query parameter with the boolean rule every other boolean attribute already follows: `false` only for `false`, `true` for a bare parameter or any other value, unset when absent.
- `show-recording` is not a boolean (it carries a recording id) and is left as it is: an empty value is ignored, as today.

The fix makes these existing scenarios pass, so no delta spec is written (`skip_specs: true`):

- `embedded-api`, requirement "Boolean attribute values", scenario "Query parameter with another value".
- `recordings`, requirement "Embedded attributes for recordings", scenario "show-only-recordings as a query parameter".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The specs already state the intended behavior.

## Impact

- Embedded API: query parameter of the iframe and the direct link only; the webcomponent already behaves this way. No public contract changes: the TSDoc of `show-only-recordings` already documents the rule.
- Meeting UI: such a URL now opens the room recordings page instead of the meeting.
- REST API, webhooks, console UI, deployment configuration: not affected.
- Code: the room entry parameter parsing of the `shared-meet-components` library.
- openvidu.io: no page changes; `shared/meet/webcomponent/attributes.md` already states the rule and the iframe and direct link pages defer to it.
