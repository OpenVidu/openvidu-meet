import { createApplication } from '@angular/platform-browser';
import { RuntimeConfigService } from '@openvidu-meet/shared-components';
import { appConfig } from './app/app.config';
import { registerOpenViduMeetElement } from './app/custom-element/register';

function ensureMaterialAssets(): void {
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
}

function bootstrapWebComponent(): void {
	ensureMaterialAssets();

	createApplication(appConfig)
		.then((app) => {
			// Flip RuntimeConfigService into webcomponent mode BEFORE the custom
			// element is registered.
			app.injector.get(RuntimeConfigService).enableWebcomponentMode();
			registerOpenViduMeetElement(app.injector);
		})
		.catch((err) => console.error(err));
}

if (typeof document === 'undefined' || document.body) {
	bootstrapWebComponent();
} else {
	document.addEventListener('DOMContentLoaded', () => bootstrapWebComponent(), { once: true });
}
