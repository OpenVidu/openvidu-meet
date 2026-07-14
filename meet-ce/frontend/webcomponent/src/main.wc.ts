import { createApplication } from '@angular/platform-browser';
import { RuntimeConfigService } from '@openvidu-meet/shared-components';
import { appConfig } from './app/app.config';
import { registerOpenViduMeetElement } from './app/custom-element/register';

const ensureMaterialAssets = (): void => {
	if (typeof document === 'undefined') {
		return;
	}

	const assets = [
		{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
		{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap' },
		{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/icon?family=Material+Icons' },
		{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined' }
	] as const;

	for (const asset of assets) {
		const selector = `link[href="${asset.href}"]`;

		if (document.head.querySelector(selector)) {
			continue;
		}

		const link = document.createElement('link');
		link.rel = asset.rel;
		link.href = asset.href;

		if ('crossorigin' in asset) {
			link.crossOrigin = asset.crossorigin;
		}

		document.head.appendChild(link);
	}
};

/**
 * Boots the Angular application and registers the OpenVidu Meet custom element
 * under `tagName`. Exported so the lazy loader (`main.loader.ts`) can reuse this
 * same bundle to register the internal `openvidu-meet-impl` tag.
 */
export const bootstrapOpenViduMeet = async (tagName?: string): Promise<void> => {
	ensureMaterialAssets();

	try {
		const app = await createApplication(appConfig);
		// Flip RuntimeConfigService into webcomponent mode BEFORE the custom element is registered.
		app.injector.get(RuntimeConfigService).enableWebcomponentMode();
		registerOpenViduMeetElement(app.injector, tagName);
	} catch (err) {
		console.error(err);
		throw err;
	}
};

// Auto-bootstrap the public `<openvidu-meet>` tag for the standalone bundle
// (IIFE via `<script src>` and direct ESM `import()`). The loader suppresses
// this by setting the flag before importing, then registers `openvidu-meet-impl`
// itself via the exported `bootstrapOpenViduMeet`.
declare global {
	// eslint-disable-next-line no-var
	var __OV_MEET_SKIP_AUTODEFINE__: boolean | undefined;
}

if (!globalThis.__OV_MEET_SKIP_AUTODEFINE__) {
	// The failure is already logged inside bootstrapOpenViduMeet; swallow the
	// rejection here so the standalone auto-bootstrap path doesn't surface an
	// `unhandledrejection`. (The loader path awaits and handles the error itself.)
	const autoBootstrap = (): void => void bootstrapOpenViduMeet().catch(() => {});

	if (typeof document === 'undefined' || document.body) {
		autoBootstrap();
	} else {
		document.addEventListener('DOMContentLoaded', autoBootstrap, { once: true });
	}
}
