import { computed, Injectable, signal } from '@angular/core';

declare global {
	interface Window {
		__OPENVIDU_MEET_CONFIG__?: {
			basePath: string;
		};
	}
}

/**
 * Service responsible for managing runtime configuration such as base paths for assets.
 * It reads from a global configuration object injected at runtime (e.g., by the server or hosting environment) and provides utility methods to resolve asset paths.
 * This allows the application to be flexible in different deployment contexts (e.g., served from root, subpath, or embedded in an iframe).
 */
@Injectable({
	providedIn: 'root'
})
export class RuntimeConfigService {
	private _basePath: string;
	/**
	 * Base URL of the OpenVidu Meet backend server.
	 * Empty string means “same origin” (relative requests). Derived from the
	 * `room-url` attribute of the `<openvidu-meet>` element at construction time,
	 * then updated reactively via `setServerUrl()` when the input changes.
	 */
	private readonly _serverUrl = signal<string>('');
	/**
	 * True once the service is in webcomponent mode (i.e. setServerUrl() has been
	 * called at least once). In a regular SPA context this never becomes true,
	 * which means serverUrlReady is immediately true.
	 */
	private readonly _webcomponentMode = signal(false);

	/**
	 * Emits true when it is safe to make API requests:
	 * - Regular SPA: immediately true (not in webcomponent mode).
	 * - Webcomponent: true once setServerUrl() has been called (which enables mode and sets URL).
	 */
	readonly serverUrlReady = computed(() => {
		// In SPA mode (not webcomponent), always ready
		if (!this._webcomponentMode()) return true;

		// In webcomponent mode, only ready once serverUrl is set
		return !!this._serverUrl();
	});

	readonly serverUrl = this._serverUrl.asReadonly();
	readonly isWebcomponentMode = this._webcomponentMode.asReadonly();

	constructor() {
		// Read from injected config, fallback to document base element, then to '/'
		this._basePath = window.__OPENVIDU_MEET_CONFIG__?.basePath || this.getBasePathFromDocument() || '/';
	}

	get basePath(): string {
		return this._basePath;
	}

	/**
	 * Enables webcomponent mode. Once enabled, serverUrlReady will only be true
	 * once setServerUrl() has been called with a value.
	 * Should be called by the webcomponent as early as possible.
	 */
	enableWebcomponentMode(): void {
		this._webcomponentMode.set(true);
	}

	/**
	 * Overrides the server URL at runtime and enables webcomponent mode.
	 * Called by the webcomponent when the server URL is determined.
	 */
	setServerUrl(url: string): void {
		this._webcomponentMode.set(true);
		this._serverUrl.set(url.endsWith('/') ? url.slice(0, -1) : url);
	}

	/**
	 * Resolves path relative to the base path.
	 *
	 * @param path
	 * @returns The full path including the base path (e.g., '/meet/assets/sounds/file.mp3')
	 */
	resolvePath(path: string): string {
		const serverUrl = this.serverUrl();
		if (!serverUrl || path.startsWith('http://') || path.startsWith('https://')) {
			return path;
		}
		return `${serverUrl}/${path.startsWith('/') ? path.slice(1) : path}`;
	}

	private getBasePathFromDocument(): string | null {
		try {
			const baseElement = document.querySelector('base');
			if (baseElement) {
				return baseElement.getAttribute('href') || null;
			}
		} catch (e) {
			console.warn('Could not read base element:', e);
		}
		return null;
	}
}
