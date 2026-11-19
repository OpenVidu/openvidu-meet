import { Service } from '@angular/core';

/**
 * @internal
 */
@Service()
export class DocumentService {
	constructor() {}

	toggleFullscreen(element: Element | null) {
		const root = element?.getRootNode() as Document | ShadowRoot | undefined;

		if (root?.fullscreenElement) {
			this.exitFullscreen(this.getDocument());
		} else {
			this.requestFullscreen(element);
		}
	}

	/**
	 * @internal
	 * Get the document object (can be overridden for testing)
	 */
	protected getDocument(): any {
		return window.document;
	}

	/**
	 * @internal
	 * Request fullscreen on element using vendor-specific methods
	 */
	protected requestFullscreen(element: any): void {
		if (!element) return;

		if (element.requestFullscreen) {
			element.requestFullscreen();
		} else if (element.msRequestFullscreen) {
			element.msRequestFullscreen();
		} else if (element.mozRequestFullScreen) {
			element.mozRequestFullScreen();
		} else if (element.webkitRequestFullscreen) {
			element.webkitRequestFullscreen();
		}
	}

	/**
	 * @internal
	 * Exit fullscreen using vendor-specific methods
	 */
	protected exitFullscreen(document: any): void {
		if (!document) return;

		if (document.exitFullscreen) {
			document.exitFullscreen();
		} else if (document.msExitFullscreen) {
			document.msExitFullscreen();
		} else if (document.mozCancelFullScreen) {
			document.mozCancelFullScreen();
		} else if (document.webkitExitFullscreen) {
			document.webkitExitFullscreen();
		}
	}
}
