# Proposal

## Why

`<openvidu-meet>` renders inside a shadow root, but its styles cross that boundary both ways:

- Inward: the element copies every `<style>` of the host document's `<head>` into its shadow root, now and whenever one is added, so the host page's own rules (`button { ... }`, utility classes) restyle Meet.
- Outward: Meet's global styles, Angular Material's included, also land in the host document's `<head>` (any root component Angular creates outside the shadow root, such as the CDK style loader, makes the document head a style host for every later style), so they restyle the host page's own elements, for example the host's own Angular Material components.

A host embedding a webcomponent expects neither side to touch the other.

## What Changes

- The element keeps Meet's styles inside its shadow root only and stops copying the host page's `<style>` elements in.
- The host document's `<head>` receives only the font stylesheets the element already adds by design (requirement "Fonts are added to the host page once").
- What CSS lets cross a shadow root by design keeps crossing: inherited properties and custom properties set on the element, and the shadow parts `loading` and `error` of the loader.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-distribution`: adds the requirement "Styles stay on their side of the element"; the spec only says today that Meet renders inside the element's shadow root.

## Impact

- Embedded API: the webcomponent only; the iframe and the direct link are separate documents and are not affected. No public contract changes.
- Meeting UI inside the element: renders with Meet's own styles only. A host that styled Meet's internals through a global `<style>` loses that, which was never a supported customization.
- Host page: no longer restyled by Meet.
- REST API, webhooks, console UI, deployment configuration: not affected.
- Code: `meet-ce/frontend/webcomponent/src/app/shadow-dom/` and the webcomponent app config (see design.md).
- openvidu.io: none required. `docs/meet/embedded/reference/webcomponent.md` does not describe styling of the element.

## Decisions to confirm

- Host page styles no longer reach Meet at all (proposed). Alternative: keep copying them in as an unofficial theming hook, fixing only the outward leak.
