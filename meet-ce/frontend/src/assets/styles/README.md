# Design System Documentation

## File Structure

```
src/assets/styles/
├── _design-tokens.scss       # Main entry point (imports all modules)
├── _tokens-core.scss          # Core variables (colors, spacing, typography)
├── _tokens-themes.scss        # Theme-specific variables (light/dark)
├── _mixins-layout.scss        # Layout mixins (containers, grids, positioning)
├── _mixins-components.scss    # Component mixins (cards, buttons, headers)
├── _mixins-responsive.scss    # Responsive design utilities
├── _animations.scss           # Animation keyframes and classes
└── _utilities.scss            # Utility classes
```

## File Responsibilities

### `_tokens-core.scss`

Contains fundamental design tokens:

- Primary colors
- Conceptual icon colors
- Spacing and dimensions
- Border radius values
- Typography (font families, sizes, weights, line heights)
- Transition timings
- Layout variables (container width, grid gap)
- Icon sizes
- Interaction states
- Breakpoints
- Component-specific tokens (cards, buttons, forms)

### `_tokens-themes.scss`

Contains theme-specific overrides:

- Light theme surface colors, text colors, shadows, and borders
- Dark theme overrides for all color-related variables
- Theme-specific styling that changes between light and dark modes

### `_mixins-layout.scss`

Contains layout-related mixins:

- `ov-theme-transition` - Smooth theme transitions
- `ov-container` - Responsive containers
- `ov-text-truncate` - Text truncation
- `ov-flex-center` - Flex centering
- `ov-grid-responsive` - Responsive grids
- `ov-hover-lift` - Hover effects
- `ov-icon` - Icon sizing

### `_mixins-components.scss`

Contains component-specific mixins:

- `ov-card` - Consistent card styling
- `ov-button-base` - Base button styling
- `ov-stat-card` - Statistics card styling
- `ov-page-header` - Page header styling
- `ov-get-started-header` - Get started header styling

### `_mixins-responsive.scss`

Contains responsive design utilities:

- Breakpoint variables (Sass variables for media queries)
- Responsive mixins (`ov-mobile-down`, `ov-tablet-up`, etc.)

### `_animations.scss`

Contains animation definitions:

- Keyframe animations (`fadeIn`, `slideIn`, `pulse`, `shimmer`)
- Animation utility classes (`.fade-in`, `.slide-in`, etc.)

### `_utilities.scss`

Contains utility classes:

- Text utilities (`.ov-text-center`, `.ov-text-truncate`)
- Spacing utilities (`.ov-mt-*`, `.ov-mb-*`, `.ov-padding-*`)
- Theme classes (`.ov-theme-transition`)
- Conceptual icon classes (`.ov-room-icon`, `.ov-recording-icon`, etc.)
- Surface and background classes

## Usage Examples

The usage remains exactly the same as before:

```scss
// Import the design tokens (same as before)
@import 'design-tokens';

// Use mixins (same as before)
.my-component {
	@include ov-card;
	@include ov-hover-lift(-3px);

	// Use CSS variables (same as before)
	padding: var(--ov-meet-spacing-lg);
	color: var(--ov-meet-text-primary);
}

// Use utility classes (same as before)
.my-element {
	@extend .ov-flex-center;
}
```
