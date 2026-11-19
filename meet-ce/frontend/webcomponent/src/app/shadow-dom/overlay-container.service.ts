import { OverlayContainer } from '@angular/cdk/overlay';
import { Injectable, OnDestroy } from '@angular/core';

/**
 * Keeps the CDK overlay container inside the shadow root so that overlays (tooltips, menus, dialogs)
 * inherit Material theme tokens defined on :host, and inside the element of the shadow root that is
 * in fullscreen, the only one the browser shows meanwhile.
 * By default CDK appends to document.body, outside the shadow boundary.
 */
@Injectable()
export class ShadowOverlayContainer extends OverlayContainer implements OnDestroy {
	private shadowRoot: ShadowRoot | null = null;

	private readonly placeContainer = (): void => {
		const parent = this.shadowRoot?.fullscreenElement ?? this.shadowRoot ?? this._document.body;

		if (this._containerElement && this._containerElement.parentNode !== parent) {
			parent.appendChild(this._containerElement);
		}
	};

	constructor() {
		super();
		this._document.addEventListener('fullscreenchange', this.placeContainer);
	}

	override ngOnDestroy(): void {
		this._document.removeEventListener('fullscreenchange', this.placeContainer);
		super.ngOnDestroy();
	}

	setShadowRoot(shadowRoot: ShadowRoot): void {
		this.shadowRoot = shadowRoot;
		this.placeContainer();
	}

	protected override _createContainer(): void {
		const container = this._document.createElement('div');
		container.classList.add('cdk-overlay-container');
		this._containerElement = container;
		this.placeContainer();
	}
}
