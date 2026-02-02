import { Injectable } from '@angular/core';

declare global {
	interface Window {
		__OPENVIDU_MEET_CONFIG__?: {
			basePath: string;
		};
	}
}

/**
 * Service that provides access to runtime application configuration.
 * Reads configuration injected by the server at runtime.
 */
@Injectable({
	providedIn: 'root'
})
export class AppConfigService {
	private _basePath: string;

	constructor() {
		// Read from injected config, fallback to document base element, then to '/'
		this._basePath = window.__OPENVIDU_MEET_CONFIG__?.basePath || this.getBasePathFromDocument() || '/';
	}

	/**
	 * Gets the configured base path (e.g., '/', '/meet/', '/app/path/')
	 */
	get basePath(): string {
		return this._basePath;
	}

	/**
	 * Resolves an asset path relative to the base path.
	 * Use this for assets that need absolute paths (e.g., Audio elements).
	 *
	 * @param assetPath The asset path starting with 'assets/' (no leading slash)
	 * @returns The full path including the base path (e.g., '/meet/assets/sounds/file.mp3')
	 */
	resolveAssetPath(assetPath: string): string {
		// Remove leading slash if present
		const cleanPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;

		// Combine with base path
		return `${this._basePath}${cleanPath}`;
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
