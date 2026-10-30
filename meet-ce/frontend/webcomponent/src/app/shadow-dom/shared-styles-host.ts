import { Injectable } from '@angular/core';
import { ɵSharedStylesHost as SharedStylesHost } from '@angular/platform-browser';

/**
 * Writes Meet's styles into the shadow roots of its elements only. A component Angular creates
 * outside a shadow root, such as the CDK's style loader, would otherwise add the host page's
 * `<head>` as a style host, and every later Meet style would restyle the host page.
 */
@Injectable()
export class ShadowOnlySharedStylesHost extends SharedStylesHost {
	override addHost(hostNode: Node): void {
		if (hostNode instanceof ShadowRoot) {
			super.addHost(hostNode);
		}
	}
}
