import { LIVE_ANNOUNCER_ELEMENT_TOKEN } from '@angular/cdk/a11y';
import { DestroyRef, DOCUMENT, inject, Injectable } from '@angular/core';
import { moveMeetBodyNodes } from './body-nodes';

/**
 * Moves Meet's accessibility nodes into the shadow root, as {@link ShadowOverlayContainer} does for
 * overlays.
 */
@Injectable()
export class ShadowBodyNodesService {
	private readonly _document = inject(DOCUMENT);
	private readonly _liveAnnouncerElement = inject(LIVE_ANNOUNCER_ELEMENT_TOKEN);

	rehost(shadowRoot: ShadowRoot, destroyRef: DestroyRef): void {
		destroyRef.onDestroy(moveMeetBodyNodes(this._document, shadowRoot, this._liveAnnouncerElement));
	}
}
