import { OverlayContainer } from '@angular/cdk/overlay';
import { Injectable } from '@angular/core';

/**
 * Extends Angular CDK's OverlayContainer to render overlay panels (tooltips,
 * menus, dialogs, selects, etc.) inside the webcomponent's shadow root instead
 * of appending them to document.body.
 *
 * Why this is necessary:
 * - Angular CDK's default OverlayContainer appends a `.cdk-overlay-container`
 *   div to document.body, outside the shadow root boundary.
 * - CSS custom properties (Material Design tokens like --mat-sys-primary) are
 *   defined on :host inside the shadow root and do NOT cascade to elements
 *   at document.body level.
 * - Without these tokens, overlay content renders without colors, typography,
 *   elevation, etc.
 *
 * By placing the overlay container inside the shadow root, all overlay panels
 * inherit the theme tokens and receive the mirrored Material styles from
 * ShadowStylesService.
 *
 * Usage:
 *   1. Provide this class + { provide: OverlayContainer, useExisting: ... }
 *      in app.config.ts so CDK uses it as the singleton overlay container.
 *   2. Call setShadowRoot() inside afterNextRender() in the root component.
 */
@Injectable()
export class ShadowOverlayContainer extends OverlayContainer {
	private _shadowRoot: ShadowRoot | null = null;

	setShadowRoot(shadowRoot: ShadowRoot): void {
		this._shadowRoot = shadowRoot;

		// If the container was already created before the shadow root was set
		// (edge case: CDK triggered before first render), move it now.
		if (this._containerElement) {
			shadowRoot.appendChild(this._containerElement);
		}
	}

	protected override _createContainer(): void {
		const container = this._document.createElement('div');
		container.classList.add('cdk-overlay-container');
		(this._shadowRoot ?? this._document.body).appendChild(container);
		this._containerElement = container;
	}
}
