# Design

## Context

- `ShadowStylesService` (`webcomponent/src/app/shadow-dom/styles.service.ts`) clones every `<style>` of `document.head` into the App's shadow root and observes `head` for more. It does not tell Meet's styles from the host's.
- Angular 22 already places styles in the shadow root: `ShadowDomRenderer` registers the App's shadow root as a host of the shared style host, and a root component created inside a shadow root uses that root as its style host. But a root component created detached (the CDK `_CdkPrivateStyleLoader` creates one to load structural styles) resolves its style host to `document.head`, and from then on the shared style host writes every style to `document.head` as well. With the full bundle imported directly, without the loader, the element itself is in the document and its root resolves to `document.head` from the start.
- `main.wc.ts` adds the Roboto and Material font `<link>`s to `document.head` on purpose: `@font-face` is not honored inside a shadow root in every browser.

## Goals / Non-Goals

**Goals:**
- No Meet stylesheet in `document.head` except the font links, with or without the loader.
- No host `<style>` copied into Meet's shadow root.

**Non-Goals:**
- A theming API for hosts (custom properties or parts beyond `loading` and `error`).
- The iframe and the direct link, which are separate documents.

## Decisions

1. **Measure before editing.** First record, in a real browser through CDP, which `<style>` elements of `document.head` come from Meet after joining a meeting and opening menus and dialogs, and which elements Meet appends outside its shadow root (the CDK live announcer under `body`, `cdk-global-scrollblock` on `<html>`). The decisions below assume the mechanism of Context; if the measurement shows another source, adjust them before coding.
2. **Stop cloning `document.head`.** Delete the head mirroring of `ShadowStylesService`: Angular already writes Meet's styles into the shadow root it registers as a style host. Keep the overlay container re-hosting.
3. **Keep `document.head` out of Meet's style hosts.** In the webcomponent app config, provide the shared style host (`ɵSharedStylesHost`, also read through core's `SHARED_STYLES_HOST`) as a subclass whose `addHost` ignores `document.head`, so detached root components and a directly imported bundle style only the registered shadow roots. Several elements on one page each register their own shadow root, so each gets every style.
   - Alternative: let styles reach `head`, then move them into each shadow root with a `MutationObserver`. Rejected: Angular does not mark its style elements in the browser (`ng-app-id` is set only on the server), so they cannot be told from the host's, which is today's bug.
   - Alternative: compile Meet's styles to constructable stylesheets adopted by the shadow root. Rejected: it bypasses Angular's style handling for every component, a much larger change.
4. **Elements outside the shadow root.** Whatever Meet still appends outside its shadow root (step 1) is either re-hosted inside it, as the overlay container already is, or styled inline, so dropping its rules from `head` cannot leave, for example, the live announcer's text visible on the host page.

The change is client-side only and behaves the same with any number of Meet replicas.

## Risks / Trade-offs

- [`ɵSharedStylesHost` is a private Angular API] -> One provider in the webcomponent app config, guarded by the e2e scenario "Meet's rules do not reach the host page", which fails on an Angular upgrade that changes it.
- [A host relied on its global styles reaching Meet] -> Never supported; flagged in the proposal's Decisions to confirm.
