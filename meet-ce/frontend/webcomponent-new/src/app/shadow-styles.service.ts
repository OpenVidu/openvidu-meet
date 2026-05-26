import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';

/**
 * Mirrors Angular-injected global styles into the webcomponent's shadow root.
 *
 * Angular Material components use ViewEncapsulation.None, which causes Angular to
 * inject their styles (component CSS, MDC styles, animation state rules) into
 * document.head. Those styles cannot cross the Shadow DOM boundary, so this service
 * clones every <style> element from document.head into the shadow root and observes
 * future additions via MutationObserver to handle lazy-loaded Material components.
 *
 * A WeakSet guard prevents duplicate cloning if the same <style> element appears
 * in multiple MutationObserver callbacks.
 *
 * Usage: inject in the root component, call reflect() inside afterNextRender().
 */
@Injectable()
export class ShadowStylesService {
	private readonly _document = inject(DOCUMENT);

	reflect(shadowRoot: ShadowRoot, destroyRef: DestroyRef): void {
		// Track which elements have already been cloned to prevent duplicates.
		const mirrored = new WeakSet<HTMLStyleElement>();

		const cloneInto = (style: HTMLStyleElement): void => {
			if (mirrored.has(style)) return;

			mirrored.add(style);
			shadowRoot.appendChild(style.cloneNode(true));
		};

		// 1. Mirror styles already present at first render time.
		this._document.head.querySelectorAll('style').forEach((el) => cloneInto(el as HTMLStyleElement));

		// 2. Mirror any styles Angular adds later (e.g. lazy-loaded Material components).
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

