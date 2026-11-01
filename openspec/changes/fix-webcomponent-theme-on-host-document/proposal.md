# Proposal

## Why

Once `<openvidu-meet>` connects, it rewrites the host page's `<html>` element: it removes the host's own
`data-theme` attribute in light mode, sets `data-theme="dark"` in dark mode, adds its own attribute and
custom properties, and leaves them behind when the element is removed. A host styled through
`<html data-theme="cupcake">` (daisyUI, Docusaurus, Pico) loses its theme.

## What Changes

- In the embedded element, the theme attributes and `--ov-*` custom properties are set on the element
  itself, never on the host document; the host `<html>` keeps every attribute and style it had.
- The standalone app and the iframe keep theming their own document.
- A new requirement states that the element leaves the host page's root element untouched. This also makes
  the 3.10.0 line "Each side's styles now stay on its side of the element's shadow root" true.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-distribution`: ADDED "The host page's root element is left untouched".

## Impact

- Embedded API: webcomponent only; no contract change.
- Meeting UI: the meeting keeps its light, dark or custom theme inside the element.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the theme services of `shared-meet-components` (one target element: the document root in the SPA,
  the shadow host in the webcomponent) and the webcomponent app config. This is a CE extension seam: the
  target element is injectable by any application shell built on the library.
- openvidu.io: none.

## Decisions to confirm

- Whether the element follows the system color scheme when the host has no theme. Proposed: yes, inside
  the element only. Alternative: stay on the light theme unless the host sets the theme.

## Source

3.10.0 pre-release audit, finding EM-3 (medium, verified-live), introduced by #135 (styles) on top of earlier releases (theme services).
