# Design System Documentation

## The one rule that matters

`_design-tokens.scss` is loaded by (almost) **every component stylesheet** in the
library. Each component stylesheet is its own Sass compilation unit, so any
top-level CSS reachable from that barrel is emitted **once per component**. This
used to duplicate the whole token/utility/animation layer 51 times (~2.7 MB of
compiled CSS, ~38% of the SPA `main` bundle) before it was split.

The system is therefore divided in two layers:

- **Pure API** (safe to load from components — emits no CSS):
  mixins, functions, Sass variables and `%placeholder` selectors.
- **Emitting layer** (loaded exactly ONCE per runtime root):
  token values on the root, utility classes, animation keyframes.

The emitting layer has exactly two consumers:

| Runtime | Entry point | Root selectors |
| ------- | ----------- | -------------- |
| SPA | `src/styles.scss` | `html`, `html[data-theme='dark']` |
| Webcomponent | `webcomponent/src/app/app.material.scss` | `:host`, `:host([data-theme='dark'])` (inside the shadow root — the WC's global `styles.scss` is NOT bundled) |

Both emit tokens + Material theme through `_runtime-theme.scss` and inline
`_utilities.scss` / `_animations.scss` via `meta.load-css`.

**Never add a top-level class/rule to a file forwarded by `_design-tokens.scss`.**
The `anyComponentStyle` budget in `angular.json` (24 kb warn / 48 kb error) will
flag it if you do.

## File Structure

```
projects/shared-meet-components/styles/
├── _design-tokens.scss        # Barrel for components — forwards PURE API only
│
│   Pure API (no CSS output):
├── _tokens-core.scss          # emit-core-token-values mixin (colors, spacing, typography…)
├── _tokens-themes.scss        # emit-light/dark-theme-token-values mixins
├── _mixins-layout.scss        # Layout mixins (containers, grids, positioning)
├── _mixins-components.scss    # Component mixins (cards, buttons, headers)
├── _mixins-responsive.scss    # Responsive mixins (ov-mobile-down, ov-tablet-up…)
├── _utilities-api.scss        # Utility PLACEHOLDERS (%ov-x) for @extend
│
│   Emitting layer (global entry points only):
├── _utilities.scss            # Publishes .ov-x classes by extending %ov-x
├── _animations.scss           # Keyframes + animation classes (fadeIn, pulse…)
├── _runtime-theme.scss        # emit-runtime-theme($root, $dark, $is-shadow-root)
└── openvidu-theme.scss        # Angular Material theme definitions
```

## Using it from a component stylesheet

```scss
@use '_design-tokens.scss';

.my-component {
	// Mixins — inlined into your selector.
	@include design-tokens.ov-card;
	@include design-tokens.ov-mobile-down { padding: 0; }

	// CSS custom properties — resolved at runtime from the root emission,
	// no import needed at all for these.
	padding: var(--ov-meet-spacing-lg);
	color: var(--ov-meet-text-primary);
}

// Utilities — extend the PLACEHOLDER form (%ov-x, not .ov-x). Your component
// only materializes the rules it extends, including related rules
// (responsive blocks, sibling combinators like toolbar + table-container).
.my-toolbar {
	@extend %ov-data-toolbar;
}
```

In templates you can also use the utility classes directly
(`class="ov-flex-center ov-mt-md"`) — they are always present on both runtime
roots via the global emission.

### Adding a new utility

1. Define it as `%ov-my-utility { … }` in `_utilities-api.scss`.
2. Publish the class twin in `_utilities.scss`:
   `.ov-my-utility { @extend %ov-my-utility; }`

### Keyframes

Components may reference the shared keyframes by name (`animation: fadeIn …`);
they resolve at runtime against the document (SPA) or the shadow root (WC),
both of which load `_animations.scss` globally. Don't forward `_animations.scss`
from the barrel.
