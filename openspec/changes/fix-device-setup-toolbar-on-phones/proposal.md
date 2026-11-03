# Proposal

## Why

`fix-device-setup-toolbar-covers-host-page` keeps the device setup toolbar of `<openvidu-meet>` inside the element by positioning it against the setup container. On phones (a touch device with a phone-size window) that container resets every property, its positioning included, so the language toolbar and the loading overlay are again positioned against the host page: a full-width strip about 80 pixels tall covers the top of the host page and takes its taps.

## What Changes

- The device setup screen positions its toolbar and overlay against its own element in every layout, phones included.
- A declaration the browser already ignored (`display: content`) goes away.
- No spec change: `embedded-distribution` "The device setup screen stays within the element" already requires it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- Embedded API: webcomponent on phones only; no contract change.
- Meeting UI: none visible in the standalone app or the iframe, where the element fills the page.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the device setup component styles in `shared-meet-components`.
- openvidu.io: none.

## Source

Review of PR #166 (`fix-device-setup-toolbar-covers-host-page`), 2026-11-03.
