import { OverlayContainer } from '@angular/cdk/overlay';
import { Injectable } from '@angular/core';

/**
 * Re-parents the CDK overlay container inside the shadow root so that overlays
 * (tooltips, menus, dialogs) inherit Material theme tokens defined on :host.
 * By default CDK appends to document.body, outside the shadow boundary.
 */
@Injectable()
export class ShadowOverlayContainer extends OverlayContainer {
	private _shadowRoot: ShadowRoot | null = null;

	setShadowRoot(shadowRoot: ShadowRoot): void {
		this._shadowRoot = shadowRoot;

		// Edge case: CDK may create the container before afterNextRender fires.
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
