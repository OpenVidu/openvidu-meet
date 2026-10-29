import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';

/** Accessibility nodes the CDK appends to `document.body` and hides with Meet's styles only. */
const CDK_BODY_NODES = '.cdk-live-announcer-element, .cdk-describedby-message-container';

/**
 * Moves into the shadow root the accessibility nodes the CDK appends to `document.body`, where the
 * styles that hide them no longer reach, as {@link ShadowOverlayContainer} does for overlays.
 */
@Injectable()
export class ShadowBodyNodesService {
	private readonly _document = inject(DOCUMENT);

	rehost(shadowRoot: ShadowRoot, destroyRef: DestroyRef): void {
		const rehost = (node: Node): void => {
			if (node instanceof Element && node.matches(CDK_BODY_NODES)) {
				shadowRoot.appendChild(node);
			}
		};

		Array.from(this._document.body.children).forEach(rehost);

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				mutation.addedNodes.forEach(rehost);
			}
		});

		observer.observe(this._document.body, { childList: true });
		destroyRef.onDestroy(() => observer.disconnect());
	}
}
