import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';

/**
 * Mirrors Angular-injected global styles into the shadow root. Angular Material
 * uses ViewEncapsulation.None, so its styles land in document.head and cannot
 * cross the shadow boundary — this service clones them in and observes future
 * additions via MutationObserver for lazy-loaded components.
 */
@Injectable()
export class ShadowStylesService {
	private readonly _document = inject(DOCUMENT);

	reflect(shadowRoot: ShadowRoot, destroyRef: DestroyRef): void {
		const mirrored = new WeakSet<HTMLStyleElement>();

		const cloneInto = (style: HTMLStyleElement): void => {
			if (mirrored.has(style)) return;

			mirrored.add(style);
			shadowRoot.appendChild(style.cloneNode(true));
		};

		this._document.head.querySelectorAll('style').forEach((el) => cloneInto(el as HTMLStyleElement));

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of Array.from(mutation.addedNodes)) {
					if (node instanceof HTMLStyleElement) {
						cloneInto(node);
					}
				}
			}
		});

		observer.observe(this._document.head, { childList: true });
		destroyRef.onDestroy(() => observer.disconnect());
	}
}
